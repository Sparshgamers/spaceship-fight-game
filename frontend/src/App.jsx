import React, { useState, useEffect } from 'react';
import io from 'socket.io-client';
import Lobby from './components/Lobby';
import GameRoom from './components/GameRoom';
import { initTelegramAuth } from './utils/telegramAuth';

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:3001';

function App() {
  const [socket, setSocket] = useState(null);
  const [inGame, setInGame] = useState(false);
  const [roomData, setRoomData] = useState(null);
  const [telegramUser, setTelegramUser] = useState(null);

  useEffect(() => {
    // Initialize Telegram WebApp
    const user = initTelegramAuth();
    setTelegramUser(user);

    // Connect to socket
    const newSocket = io(SOCKET_URL);
    setSocket(newSocket);

    return () => {
      newSocket.close();
    };
  }, []);

  const handleCreateRoom = (playerName, gameMode) => {
    if (socket) {
      socket.emit('createRoom', { 
        playerName: playerName || telegramUser?.username || 'Player', 
        gameMode 
      });
      
      socket.once('roomCreated', (data) => {
        setRoomData(data);
        setInGame(true);
      });
    }
  };

  const handleJoinRoom = (roomId, playerName) => {
    if (socket) {
      socket.emit('joinRoom', { 
        roomId, 
        playerName: playerName || telegramUser?.username || 'Player' 
      });
      
      socket.once('joinSuccess', (data) => {
        setRoomData(data);
        setInGame(true);
      });
      
      socket.once('joinError', (error) => {
        alert(error.error);
      });
    }
  };

  const handleLeaveGame = () => {
    setInGame(false);
    setRoomData(null);
  };

  if (!socket) {
    return <div className="app">Connecting to server...</div>;
  }

  return (
    <div className="app">
      {!inGame ? (
        <Lobby 
          onCreateRoom={handleCreateRoom}
          onJoinRoom={handleJoinRoom}
          telegramUser={telegramUser}
        />
      ) : (
        <GameRoom 
          roomId={roomData.roomId}
          playerName={telegramUser?.username || 'Player'}
          socket={socket}
          gameState={roomData.gameState}
          onLeave={handleLeaveGame}
        />
      )}
    </div>
  );
}

export default App;
