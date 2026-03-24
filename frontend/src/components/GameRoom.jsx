import React, { useState, useEffect, useRef } from 'react';
import io from 'socket.io-client';

const GameRoom = ({ roomId, playerName, socket, gameState: initialGameState }) => {
  const [gameState, setGameState] = useState(initialGameState);
  const [isReady, setIsReady] = useState(false);
  const [canvas, setCanvas] = useState(null);
  const canvasRef = useRef(null);
  
  // Spaceship position for local player
  const [shipPosition, setShipPosition] = useState({ x: 400, y: 500 });
  const [opponents, setOpponents] = useState({});
  const [projectiles, setProjectiles] = useState([]);
  
  useEffect(() => {
    if (!socket) return;
    
    // Socket event listeners
    socket.on('roomUpdate', (updatedState) => {
      setGameState(updatedState);
    });
    
    socket.on('gameStarted', ({ gameState: startedState }) => {
      setGameState(startedState);
    });
    
    socket.on('opponentAction', ({ playerId, action, data }) => {
      handleOpponentAction(playerId, action, data);
    });
    
    socket.on('healthUpdate', ({ playerId, health }) => {
      updatePlayerHealth(playerId, health);
    });
    
    socket.on('playerEliminated', ({ playerId, playerName }) => {
      console.log(`${playerName} eliminated!`);
    });
    
    socket.on('gameTick', ({ players }) => {
      updateGameTick(players);
    });
    
    socket.on('gameEnded', ({ winner, finalScores }) => {
      alert(`Game Over! Winner: ${winner.type === 'team' ? `Team ${winner.id}` : winner.id}`);
    });
    
    return () => {
      socket.off('roomUpdate');
      socket.off('gameStarted');
      socket.off('opponentAction');
      socket.off('healthUpdate');
      socket.off('playerEliminated');
      socket.off('gameTick');
      socket.off('gameEnded');
    };
  }, [socket]);
  
  // Canvas setup and game loop
  useEffect(() => {
    if (!canvasRef.current) return;
    
    const ctx = canvasRef.current.getContext('2d');
    let animationId;
    
    const draw = () => {
      // Clear canvas
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, canvasRef.current.width, canvasRef.current.height);
      
      // Draw stars background
      drawStars(ctx);
      
      // Draw opponent ships
      Object.values(opponents).forEach(opp => {
        drawSpaceship(ctx, opp.x, opp.y, opp.team, opp.health);
      });
      
      // Draw projectiles
      projectiles.forEach(proj => {
        ctx.fillStyle = '#ffff00';
        ctx.fillRect(proj.x - 2, proj.y - 4, 4, 8);
      });
      
      // Draw local player ship
      drawSpaceship(ctx, shipPosition.x, shipPosition.y, 
        gameState?.players?.find(p => p.id === socket?.id)?.team || 1, 
        getPlayerHealth());
      
      animationId = requestAnimationFrame(draw);
    };
    
    draw();
    
    return () => cancelAnimationFrame(animationId);
  }, [opponents, projectiles, shipPosition]);
  
  // Keyboard controls
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (gameState?.gameState !== 'active') return;
      
      let newX = shipPosition.x;
      let newY = shipPosition.y;
      
      switch(e.key) {
        case 'ArrowLeft': newX -= 20; break;
        case 'ArrowRight': newX += 20; break;
        case 'ArrowUp': newY -= 20; break;
        case 'ArrowDown': newY += 20; break;
        case ' ': // Spacebar
          shootProjectile();
          break;
      }
      
      // Boundary checking
      newX = Math.max(20, Math.min(780, newX));
      newY = Math.max(20, Math.min(580, newY));
      
      if (newX !== shipPosition.x || newY !== shipPosition.y) {
        setShipPosition({ x: newX, y: newY });
        socket.emit('playerAction', {
          action: 'move',
          data: { x: newX, y: newY }
        });
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [shipPosition, gameState]);
  
  const shootProjectile = () => {
    const newProjectile = {
      id: Date.now(),
      x: shipPosition.x,
      y: shipPosition.y - 20,
      owner: socket.id
    };
    
    setProjectiles(prev => [...prev, newProjectile]);
    
    socket.emit('playerAction', {
      action: 'shoot',
      data: { position: shipPosition }
    });
    
    // Animate projectile
    const interval = setInterval(() => {
      setProjectiles(prev => {
        const updated = prev.map(p => ({
          ...p,
          y: p.y - 10
        })).filter(p => p.y > 0);
        
        // Check collisions
        updated.forEach(proj => {
          Object.entries(opponents).forEach(([id, opp]) => {
            if (Math.abs(proj.x - opp.x) < 30 && Math.abs(proj.y - opp.y) < 30) {
              // Hit opponent
              socket.emit('dealDamage', {
                targetId: id,
                damage: 25
              });
              // Remove projectile
              updated.splice(updated.indexOf(proj), 1);
            }
          });
        });
        
        return updated;
      });
    }, 16);
    
    setTimeout(() => clearInterval(interval), 1000);
  };
  
  const drawSpaceship = (ctx, x, y, team, health) => {
    ctx.save();
    ctx.translate(x, y);
    
    // Ship color based on team
    ctx.fillStyle = team === 1 ? '#00ff00' : '#ff0000';
    
    // Draw triangle spaceship
    ctx.beginPath();
    ctx.moveTo(0, -20);
    ctx.lineTo(-15, 15);
    ctx.lineTo(-5, 10);
    ctx.lineTo(-5, 20);
    ctx.lineTo(0, 25);
    ctx.lineTo(5, 20);
    ctx.lineTo(5, 10);
    ctx.lineTo(15, 15);
    ctx.closePath();
    ctx.fill();
    
    // Health bar
    ctx.fillStyle = '#ff0000';
    ctx.fillRect(-20, -35, 40, 5);
    ctx.fillStyle = '#00ff00';
    ctx.fillRect(-20, -35, 40 * (health / 100), 5);
    
    ctx.restore();
  };
  
  const drawStars = (ctx) => {
    // Simple star background effect
    for (let i = 0; i < 100; i++) {
      ctx.fillStyle = `rgba(255, 255, 255, ${Math.random()})`;
      ctx.fillRect(Math.random() * 800, Math.random() * 600, 1, 1);
    }
  };
  
  const toggleReady = () => {
    const newReady = !isReady;
    setIsReady(newReady);
    socket.emit('playerReady', { isReady: newReady });
  };
  
  const startGame = () => {
    socket.emit('startGame');
  };
  
  const getPlayerHealth = () => {
    const player = gameState?.players?.find(p => p.id === socket?.id);
    return player?.shipHealth || 100;
  };
  
  const isHost = socket?.id === gameState?.hostId;
  const allPlayersReady = gameState?.players?.every(p => p.isReady) && gameState?.players?.length >= 2;
  
  return (
    <div className="game-room">
      <div className="game-info">
        <h3>Room: {roomId}</h3>
        <p>Mode: {gameState?.gameMode}</p>
        <p>Players: {gameState?.players?.length}/{gameState?.maxPlayers}</p>
        
        <div className="players-list">
          {gameState?.players?.map(player => (
            <div key={player.id} className="player">
              <span>{player.name}</span>
              {player.team && <span>Team {player.team}</span>}
              <span>Health: {player.shipHealth}</span>
              <span>{player.isReady ? '✓ Ready' : '⌛ Not Ready'}</span>
              {player.id === gameState.hostId && <span>👑 Host</span>}
            </div>
          ))}
        </div>
        
        {gameState?.gameState === 'waiting' && (
          <div className="lobby-controls">
            <button onClick={toggleReady}>
              {isReady ? 'Not Ready' : 'Ready'}
            </button>
            
            {isHost && (
              <button 
                onClick={startGame} 
                disabled={!allPlayersReady}
              >
                Start Game
              </button>
            )}
          </div>
        )}
        
        {gameState?.gameState === 'active' && (
          <div className="game-controls">
            <p>🎮 Use Arrow Keys to move | Space to shoot</p>
            <p>❤️ Health: {getPlayerHealth()}</p>
          </div>
        )}
      </div>
      
      <canvas
        ref={canvasRef}
        width={800}
        height={600}
        style={{ border: '2px solid white', backgroundColor: '#000' }}
      />
    </div>
  );
};

export default GameRoom;
