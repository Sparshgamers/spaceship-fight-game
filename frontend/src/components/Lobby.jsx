import React, { useState } from 'react';

const Lobby = ({ onCreateRoom, onJoinRoom }) => {
  const [playerName, setPlayerName] = useState('');
  const [gameMode, setGameMode] = useState('1v1');
  const [joinRoomId, setJoinRoomId] = useState('');

  const handleCreate = () => {
    if (playerName.trim()) {
      onCreateRoom(playerName, gameMode);
    }
  };

  const handleJoin = () => {
    if (playerName.trim() && joinRoomId.trim()) {
      onJoinRoom(joinRoomId, playerName);
    }
  };

  return (
    <div className="lobby">
      <h1>🚀 Spaceship Fight</h1>
      
      <div className="player-name">
        <input
          type="text"
          placeholder="Your Name"
          value={playerName}
          onChange={(e) => setPlayerName(e.target.value)}
        />
      </div>
      
      <div className="game-modes">
        <h3>Select Game Mode</h3>
        <div className="mode-buttons">
          <button className={gameMode === '1v1' ? 'active' : ''} onClick={() => setGameMode('1v1')}>
            ⚔️ 1v1 Duel
          </button>
          <button className={gameMode === '2v2' ? 'active' : ''} onClick={() => setGameMode('2v2')}>
            👥 2v2 Team Battle
          </button>
          <button className={gameMode === 'squad' ? 'active' : ''} onClick={() => setGameMode('squad')}>
            🔫 Squad (4 Players)
          </button>
          <button className={gameMode === '4v4' ? 'active' : ''} onClick={() => setGameMode('4v4')}>
            🚀 4v4 Epic Battle
          </button>
        </div>
      </div>
      
      <div className="create-room">
        <button onClick={handleCreate} disabled={!playerName}>
          Create New Room
        </button>
      </div>
      
      <div className="join-room">
        <h3>Or Join Existing Room</h3>
        <input
          type="text"
          placeholder="Enter Room ID"
          value={joinRoomId}
          onChange={(e) => setJoinRoomId(e.target.value.toUpperCase())}
        />
        <button onClick={handleJoin} disabled={!playerName || !joinRoomId}>
          Join Room
        </button>
      </div>
    </div>
  );
};

export default Lobby;
