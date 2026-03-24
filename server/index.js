const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const { GameRoom, rooms, GAME_MODES } = require('./roomManager');
const { initDatabase, saveGameResult } = require('./database');
const { checkGameEnd, startGameLoop } = require('./gameLogic');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
    credentials: true
  },
  transports: ['websocket', 'polling']
});

app.use(cors());
app.use(express.json());

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    rooms: rooms.size,
    timestamp: new Date().toISOString()
  });
});

// Get room info endpoint
app.get('/api/room/:roomId', (req, res) => {
  const room = rooms.get(req.params.roomId.toUpperCase());
  if (!room) {
    return res.status(404).json({ error: 'Room not found' });
  }
  res.json(room.getGameState());
});

// Socket.io connection handling
io.on('connection', (socket) => {
  console.log('✅ Player connected:', socket.id);
  let currentRoom = null;

  // Create room
  socket.on('createRoom', ({ playerName, gameMode }) => {
    console.log(`📝 Creating room - Player: ${playerName}, Mode: ${gameMode}`);
    
    const roomId = Math.random().toString(36).substring(2, 10).toUpperCase();
    const room = new GameRoom(roomId, socket.id, playerName, gameMode);
    rooms.set(roomId, room);
    
    const result = room.addPlayer(socket.id, playerName);
    socket.join(roomId);
    currentRoom = roomId;
    
    socket.emit('roomCreated', {
      roomId,
      gameState: room.getGameState()
    });
    
    io.to(roomId).emit('roomUpdate', room.getGameState());
    console.log(`🏠 Room created: ${roomId}, Players: 1/${room.maxPlayers}`);
  });

  // Join room
  socket.on('joinRoom', ({ roomId, playerName }) => {
    const room = rooms.get(roomId.toUpperCase());
    
    if (!room) {
      socket.emit('joinError', { error: '❌ Room not found!' });
      return;
    }
    
    if (room.gameState !== 'waiting') {
      socket.emit('joinError', { error: '❌ Game already in progress!' });
      return;
    }
    
    const result = room.addPlayer(socket.id, playerName);
    
    if (!result.success) {
      socket.emit('joinError', { error: result.error });
      return;
    }
    
    socket.join(roomId.toUpperCase());
    currentRoom = roomId.toUpperCase();
    
    socket.emit('joinSuccess', {
      roomId,
      team: result.team,
      gameState: room.getGameState()
    });
    
    io.to(roomId.toUpperCase()).emit('roomUpdate', room.getGameState());
    console.log(`👤 ${playerName} joined room: ${roomId}, Players: ${room.players.size}/${room.maxPlayers}`);
  });

  // Player ready toggle
  socket.on('playerReady', ({ isReady }) => {
    if (!currentRoom) return;
    
    const room = rooms.get(currentRoom);
    if (!room) return;
    
    const player = room.players.get(socket.id);
    if (player) {
      player.isReady = isReady;
      io.to(currentRoom).emit('roomUpdate', room.getGameState());
      console.log(`🟢 Player ${player.name} ready: ${isReady}`);
    }
  });

  // Host start game
  socket.on('startGame', () => {
    if (!currentRoom) return;
    
    const room = rooms.get(currentRoom);
    if (!room) return;
    
    // Verify host
    if (room.hostId !== socket.id) {
      socket.emit('error', { error: '❌ Only the host can start the game!' });
      return;
    }
    
    // Check if enough players
    if (room.players.size < 2) {
      socket.emit('error', { error: '❌ Need at least 2 players to start!' });
      return;
    }
    
    // Check if all players are ready
    const allReady = Array.from(room.players.values()).every(p => p.isReady === true);
    if (!allReady) {
      socket.emit('error', { error: '⚠️ All players must be ready before starting!' });
      return;
    }
    
    if (room.startGame()) {
      io.to(currentRoom).emit('gameStarted', { gameState: room.getGameState() });
      startGameLoop(room, io);
      console.log(`🎮 Game started in room: ${currentRoom}`);
    } else {
      socket.emit('error', { error: '❌ Cannot start game!' });
    }
  });

  // Player action (movement, shooting)
  socket.on('playerAction', ({ action, data }) => {
    if (!currentRoom) return;
    
    const room = rooms.get(currentRoom);
    if (!room || room.gameState !== 'active') return;
    
    // Broadcast action to all other players in room
    socket.to(currentRoom).emit('opponentAction', {
      playerId: socket.id,
      action,
      data
    });
  });

  // Deal damage
  socket.on('dealDamage', ({ targetId, damage }) => {
    if (!currentRoom) return;
    
    const room = rooms.get(currentRoom);
    if (!room || room.gameState !== 'active') return;
    
    const target = room.players.get(targetId);
    if (target && target.shipHealth > 0) {
      target.shipHealth = Math.max(0, target.shipHealth - damage);
      
      // Award points to attacker
      if (target.shipHealth <= 0) {
        const attacker = room.players.get(socket.id);
        if (attacker) {
          attacker.score += 10;
          console.log(`💀 ${attacker.name} eliminated ${target.name}!`);
        }
        
        io.to(currentRoom).emit('playerEliminated', {
          playerId: targetId,
          playerName: target.name
        });
      }
      
      io.to(currentRoom).emit('healthUpdate', {
        playerId: targetId,
        health: target.shipHealth
      });
      
      // Check game end condition
      const result = checkGameEnd(room);
      if (result.gameEnded) {
        room.gameState = 'ended';
        if (room.gameLoop) clearInterval(room.gameLoop);
        
        io.to(currentRoom).emit('gameEnded', {
          winner: result.winner,
          finalScores: Array.from(room.players.entries()).map(([id, p]) => ({
            id,
            name: p.name,
            score: p.score,
            team: p.team
          }))
        });
        
        // Save game result to database
        saveGameResult(room);
        
        // Delete room after 60 seconds
        setTimeout(() => {
          rooms.delete(currentRoom);
          console.log(`🗑️ Room deleted: ${currentRoom}`);
        }, 60000);
      }
    }
  });

  // Disconnect handling
  socket.on('disconnect', () => {
    console.log('❌ Player disconnected:', socket.id);
    
    if (currentRoom) {
      const room = rooms.get(currentRoom);
      if (room) {
        const player = room.players.get(socket.id);
        const playerName = player?.name || 'Unknown';
        
        const hostChange = room.removePlayer(socket.id);
        
        if (room.players.size === 0) {
          // Delete empty room
          rooms.delete(currentRoom);
          console.log(`🗑️ Room deleted (empty): ${currentRoom}`);
        } else {
          io.to(currentRoom).emit('playerDisconnected', {
            playerId: socket.id,
            playerName
          });
          
          if (hostChange) {
            io.to(currentRoom).emit('hostChanged', {
              newHostId: hostChange.newHost
            });
            console.log(`👑 New host in room ${currentRoom}: ${hostChange.newHost}`);
          }
          
          io.to(currentRoom).emit('roomUpdate', room.getGameState());
        }
      }
    }
  });
});

// Start server
const PORT = process.env.PORT || 3001;
initDatabase().then(() => {
  server.listen(PORT, () => {
    console.log(`
    🚀 SPACESHIP FIGHT SERVER 🚀
    ═══════════════════════════════
    📡 Server running on port: ${PORT}
    🌐 WebSocket: ws://localhost:${PORT}
    🏠 Rooms: Active room management
    🎮 Game modes: 1v1, 2v2, Squad, 4v4
    ═══════════════════════════════
    `);
  });
}).catch(err => {
  console.error('Failed to initialize database:', err);
});
