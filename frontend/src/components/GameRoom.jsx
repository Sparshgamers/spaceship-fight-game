import React, { useState, useEffect, useRef, useCallback } from 'react';

const GameRoom = ({ roomId, playerName, socket, gameState: initialGameState, onLeave }) => {
  const [gameState, setGameState] = useState(initialGameState);
  const [isReady, setIsReady] = useState(false);
  const canvasRef = useRef(null);
  
  // Game state
  const [localPlayer, setLocalPlayer] = useState({
    x: 400,
    y: 500,
    health: 100,
    team: 1
  });
  const [players, setPlayers] = useState({});
  const [projectiles, setProjectiles] = useState([]);
  const [particles, setParticles] = useState([]);
  const keysPressed = useRef({});
  const shootCooldown = useRef(0);
  const animationId = useRef(null);

  useEffect(() => {
    if (!socket) return;
    
    // Find local player in gameState
    const localPlayerData = gameState?.players?.find(p => p.id === socket.id);
    if (localPlayerData) {
      setLocalPlayer(prev => ({
        ...prev,
        health: localPlayerData.shipHealth,
        team: localPlayerData.team || 1
      }));
    }
    
    // Setup players map
    const playersMap = {};
    gameState?.players?.forEach(player => {
      if (player.id !== socket.id) {
        playersMap[player.id] = {
          id: player.id,
          name: player.name,
          team: player.team,
          health: player.shipHealth,
          x: 400 + Math.random() * 200 - 100,
          y: 100 + Math.random() * 100
        };
      }
    });
    setPlayers(playersMap);
    
    // Socket event listeners
    socket.on('roomUpdate', (updatedState) => {
      setGameState(updatedState);
      
      // Update local health
      const updatedPlayer = updatedState.players?.find(p => p.id === socket.id);
      if (updatedPlayer) {
        setLocalPlayer(prev => ({ ...prev, health: updatedPlayer.shipHealth }));
      }
      
      // Update other players
      const newPlayersMap = {};
      updatedState.players?.forEach(player => {
        if (player.id !== socket.id) {
          newPlayersMap[player.id] = {
            ...players[player.id],
            id: player.id,
            name: player.name,
            team: player.team,
            health: player.shipHealth
          };
        }
      });
      setPlayers(newPlayersMap);
    });
    
    socket.on('gameStarted', ({ gameState: startedState }) => {
      setGameState(startedState);
      setLocalPlayer(prev => ({ ...prev, health: 100, x: 400, y: 500 }));
      setProjectiles([]);
    });
    
    socket.on('opponentAction', ({ playerId, action, data }) => {
      if (action === 'move') {
        setPlayers(prev => ({
          ...prev,
          [playerId]: { ...prev[playerId], x: data.x, y: data.y }
        }));
      } else if (action === 'shoot') {
        addProjectile(playerId, data.position);
      }
    });
    
    socket.on('healthUpdate', ({ playerId, health }) => {
      if (playerId === socket.id) {
        setLocalPlayer(prev => ({ ...prev, health }));
      } else {
        setPlayers(prev => ({
          ...prev,
          [playerId]: { ...prev[playerId], health }
        }));
      }
    });
    
    socket.on('playerEliminated', ({ playerId, playerName }) => {
      if (playerId === socket.id) {
        alert(`You have been eliminated!`);
      } else {
        setPlayers(prev => {
          const newPlayers = { ...prev };
          delete newPlayers[playerId];
          return newPlayers;
        });
      }
    });
    
    socket.on('gameTick', ({ players: tickPlayers }) => {
      tickPlayers.forEach(p => {
        if (p.id === socket.id) {
          setLocalPlayer(prev => ({ ...prev, health: p.health }));
        } else {
          setPlayers(prev => ({
            ...prev,
            [p.id]: { ...prev[p.id], health: p.health }
          }));
        }
      });
    });
    
    socket.on('gameEnded', ({ winner, finalScores }) => {
      let message = '';
      if (winner.type === 'team') {
        message = `🏆 Team ${winner.id} Wins! 🏆`;
      } else {
        const winnerPlayer = finalScores.find(p => p.id === winner.id);
        message = `🏆 ${winnerPlayer?.name} Wins! 🏆`;
      }
      
      alert(message + '\n\n' + finalScores.map(p => `${p.name}: ${p.score} points`).join('\n'));
      onLeave();
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
  }, [socket, gameState, onLeave]);
  
  const addProjectile = (ownerId, position) => {
    setProjectiles(prev => [...prev, {
      id: Date.now() + Math.random(),
      ownerId,
      x: position?.x || 400,
      y: position?.y || 100,
      direction: ownerId === socket.id ? -1 : 1
    }]);
  };
  
  const addParticle = (x, y) => {
    setParticles(prev => [...prev, {
      id: Date.now() + Math.random(),
      x,
      y,
      life: 1
    }]);
  };
  
  const shoot = useCallback(() => {
    if (shootCooldown.current > 0) return;
    if (gameState?.gameState !== 'active') return;
    
    shootCooldown.current = 10;
    
    addProjectile(socket.id, localPlayer);
    
    socket.emit('playerAction', {
      action: 'shoot',
      data: { position: localPlayer }
    });
  }, [socket, localPlayer, gameState]);
  
  // Keyboard controls
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (gameState?.gameState !== 'active') return;
      
      keysPressed.current[e.key] = true;
      
      if (e.key === ' ') {
        e.preventDefault();
        shoot();
      }
    };
    
    const handleKeyUp = (e) => {
      keysPressed.current[e.key] = false;
    };
    
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [gameState, shoot]);
  
  // Movement update loop
  useEffect(() => {
    let lastTime = 0;
    
    const updateMovement = (currentTime) => {
      if (gameState?.gameState === 'active') {
        let newX = localPlayer.x;
        let newY = localPlayer.y;
        const speed = 8;
        
        if (keysPressed.current['ArrowLeft']) newX -= speed;
        if (keysPressed.current['ArrowRight']) newX += speed;
        if (keysPressed.current['ArrowUp']) newY -= speed;
        if (keysPressed.current['ArrowDown']) newY += speed;
        
        // Boundaries
        newX = Math.max(40, Math.min(760, newX));
        newY = Math.max(40, Math.min(560, newY));
        
        if (newX !== localPlayer.x || newY !== localPlayer.y) {
          setLocalPlayer(prev => ({ ...prev, x: newX, y: newY }));
          
          socket.emit('playerAction', {
            action: 'move',
            data: { x: newX, y: newY }
          });
        }
        
        // Cooldown update
        if (shootCooldown.current > 0) {
          shootCooldown.current--;
        }
      }
      
      animationId.current = requestAnimationFrame(updateMovement);
    };
    
    animationId.current = requestAnimationFrame(updateMovement);
    
    return () => {
      if (animationId.current) {
        cancelAnimationFrame(animationId.current);
      }
    };
  }, [socket, localPlayer.x, localPlayer.y, gameState]);
  
  // Projectile update loop
  useEffect(() => {
    const projectileInterval = setInterval(() => {
      if (gameState?.gameState !== 'active') return;
      
      setProjectiles(prev => {
        const updated = prev.map(p => ({
          ...p,
          y: p.y + (p.direction === -1 ? -8 : 8)
        })).filter(p => p.y > 0 && p.y < 600);
        
        // Check collisions
        updated.forEach(proj => {
          // Check collision with local player
          if (proj.ownerId !== socket.id) {
            const dx = Math.abs(proj.x - localPlayer.x);
            const dy = Math.abs(proj.y - localPlayer.y);
            if (dx < 25 && dy < 25) {
              socket.emit('dealDamage', { targetId: socket.id, damage: 25 });
              addParticle(proj.x, proj.y);
              updated.splice(updated.indexOf(proj), 1);
            }
          }
          
          // Check collision with other players
          Object.values(players).forEach(player => {
            if (proj.ownerId !== player.id) {
              const dx = Math.abs(proj.x - player.x);
              const dy = Math.abs(proj.y - player.y);
              if (dx < 25 && dy < 25) {
                socket.emit('dealDamage', { targetId: player.id, damage: 25 });
                addParticle(proj.x, proj.y);
                updated.splice(updated.indexOf(proj), 1);
              }
            }
          });
        });
        
        return updated;
      });
      
      // Update particles
      setParticles(prev => prev.filter(p => {
        p.life -= 0.05;
        return p.life > 0;
      }));
    }, 16);
    
    return () => clearInterval(projectileInterval);
  }, [gameState, localPlayer, players, socket]);
  
  // Drawing
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    
    const draw = () => {
      // Clear canvas with starfield effect
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      
      // Draw stars
      for (let i = 0; i < 100; i++) {
        if (i % 2 === 0) {
          ctx.fillStyle = `rgba(255, 255, 255, ${Math.random() * 0.5 + 0.3})`;
          ctx.fillRect(Math.random() * canvas.width, Math.random() * canvas.height, 1, 1);
        }
      }
      
      // Draw other players
      Object.values(players).forEach(player => {
        drawSpaceship(ctx, player.x, player.y, player.team, player.health);
        drawPlayerName(ctx, player.x, player.y - 30, player.name, player.health);
      });
      
      // Draw projectiles
      projectiles.forEach(proj => {
        ctx.fillStyle = '#ffff00';
        ctx.shadowBlur = 10;
        ctx.shadowColor = '#ffff00';
        ctx.fillRect(proj.x - 2, proj.y - 4, 4, 8);
        ctx.fillRect(proj.x - 1, proj.y - 6, 2, 4);
      });
      
      // Draw particles
      particles.forEach(p => {
        ctx.fillStyle = `rgba(255, 100, 0, ${p.life})`;
        ctx.fillRect(p.x - 2, p.y - 2, 4, 4);
      });
      
      // Draw local player
      drawSpaceship(ctx, localPlayer.x, localPlayer.y, localPlayer.team, localPlayer.health);
      drawPlayerName(ctx, localPlayer.x, localPlayer.y - 30, 'YOU', localPlayer.health);
      
      // Draw health bar for local player
      drawHealthBar(ctx, localPlayer.x - 30, localPlayer.y - 45, 60, localPlayer.health);
      
      ctx.shadowBlur = 0;
    };
    
    const drawSpaceship = (ctx, x, y, team, health) => {
      ctx.save();
      ctx.translate(x, y);
      
      // Team colors
      const colors = team === 1 ? { main: '#00ff00', glow: '#00ff00' } : { main: '#ff4444', glow: '#ff0000' };
      
      ctx.shadowBlur = 10;
      ctx.shadowColor = colors.glow;
      
      // Main body
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
      ctx.fillStyle = colors.main;
      ctx.fill();
      
      // Engine glow
      ctx.fillStyle = '#ff6600';
      ctx.beginPath();
      ctx.moveTo(-3, 20);
      ctx.lineTo(0, 30);
      ctx.lineTo(3, 20);
      ctx.fill();
      
      ctx.restore();
    };
    
    const drawPlayerName = (ctx, x, y, name, health) => {
      ctx.font = '12px "Courier New"';
      ctx.fillStyle = health > 50 ? '#00ff00' : '#ff6600';
      ctx.shadowBlur = 0;
      ctx.fillText(name, x - 20, y);
    };
    
    const drawHealthBar = (ctx, x, y, width, health) => {
      ctx.fillStyle = '#ff0000';
      ctx.fillRect(x, y, width, 5);
      ctx.fillStyle = '#00ff00';
      ctx.fillRect(x, y, width * (health / 100), 5);
    };
    
    draw();
  }, [localPlayer, players, projectiles, particles]);
  
  const toggleReady = () => {
    const newReady = !isReady;
    setIsReady(newReady);
    socket.emit('playerReady', { isReady: newReady });
  };
  
  const startGame = () => {
    socket.emit('startGame');
  };
  
  const isHost = socket.id === gameState?.hostId;
  const allPlayersReady = gameState?.players?.every(p => p.isReady) && gameState?.players?.length >= 2;
  const isGameActive = gameState?.gameState === 'active';
  
  return (
    <div className="game-room">
      <div className="game-info">
        <h3>🚀 Room: {roomId}</h3>
        <p>Mode: {gameState?.gameMode} | Players: {gameState?.players?.length}/{gameState?.maxPlayers}</p>
        
        <div className="players-list">
          {gameState?.players?.map(player => (
            <div key={player.id} className="player" style={{ borderLeftColor: player.team === 1 ? '#00ff00' : '#ff4444' }}>
              <span>{player.name}</span>
              {player.team && <span>Team {player.team}</span>}
              <span>❤️ {player.shipHealth}</span>
              <span>{player.isReady ? '✓ Ready' : '○'}</span>
              {player.id === gameState.hostId && <span>👑</span>}
              {player.id === socket.id && <span>⭐</span>}
            </div>
          ))}
        </div>
        
        {!isGameActive && (
          <div className="lobby-controls">
            <button onClick={toggleReady}>
              {isReady ? '❌ Not Ready' : '✅ Ready'}
            </button>
            
            {isHost && (
              <button 
                onClick={startGame} 
                disabled={!allPlayersReady}
                style={{ opacity: allPlayersReady ? 1 : 0.5 }}
              >
                🎮 START GAME
              </button>
            )}
          </div>
        )}
        
        <button onClick={onLeave} style={{ marginTop: '10px', background: '#ff4444' }}>
          🚪 Leave Room
        </button>
      </div>
      
      <canvas
        ref={canvasRef}
        width={800}
        height={600}
        style={{ border: '3px solid #00ff00', borderRadius: '10px', backgroundColor: '#000' }}
      />
      
      {isGameActive && (
        <div className="game-controls">
          <p>🎮 Arrow Keys to Move | Space to Shoot | Health: {localPlayer.health}%</p>
        </div>
      )}
    </div>
  );
};

export default GameRoom;
