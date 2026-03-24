const GAME_MODES = {
  '1v1': { maxPlayers: 2, teams: false, teamSize: 1 },
  '2v2': { maxPlayers: 4, teams: true, teamSize: 2 },
  'squad': { maxPlayers: 4, teams: false, teamSize: 1, battleRoyale: true },
  '4v4': { maxPlayers: 8, teams: true, teamSize: 4 }
};

class GameRoom {
  constructor(roomId, hostId, hostName, gameMode) {
    this.roomId = roomId;
    this.hostId = hostId;
    this.gameMode = gameMode;
    this.maxPlayers = GAME_MODES[gameMode].maxPlayers;
    this.players = new Map(); // playerId -> { id, name, team, shipHealth, isReady, score }
    this.gameState = 'waiting'; // waiting, active, ended
    this.gameLoop = null;
    this.createdAt = Date.now();
  }

  addPlayer(playerId, playerName) {
    if (this.players.size >= this.maxPlayers) {
      return { success: false, error: 'Room is full!' };
    }
    
    // Assign team if teams mode
    let team = null;
    if (GAME_MODES[this.gameMode].teams) {
      const teamSize = GAME_MODES[this.gameMode].teamSize;
      const team1Count = Array.from(this.players.values()).filter(p => p.team === 1).length;
      const team2Count = Array.from(this.players.values()).filter(p => p.team === 2).length;
      
      if (team1Count < teamSize) team = 1;
      else if (team2Count < teamSize) team = 2;
      else team = null;
    }
    
    this.players.set(playerId, {
      id: playerId,
      name: playerName,
      team: team,
      shipHealth: 100,
      isReady: false,
      score: 0,
      joinedAt: Date.now()
    });
    
    return { success: true, team };
  }

  removePlayer(playerId) {
    const player = this.players.get(playerId);
    if (!player) return null;
    
    this.players.delete(playerId);
    
    // If host leaves and room still has players, assign new host
    if (playerId === this.hostId && this.players.size > 0) {
      const newHost = Array.from(this.players.keys())[0];
      this.hostId = newHost;
      return { newHost };
    }
    
    return null;
  }

  canHostStart() {
    return this.players.size >= 2;
  }

  startGame() {
    if (this.gameState !== 'waiting') return false;
    if (!this.canHostStart()) return false;
    
    this.gameState = 'active';
    
    // Initialize all players with full health
    this.players.forEach((player, id) => {
      player.shipHealth = 100;
      player.score = 0;
    });
    
    return true;
  }

  getGameState() {
    return {
      roomId: this.roomId,
      hostId: this.hostId,
      gameMode: this.gameMode,
      maxPlayers: this.maxPlayers,
      gameState: this.gameState,
      players: Array.from(this.players.entries()).map(([id, p]) => ({
        id,
        name: p.name,
        team: p.team,
        shipHealth: p.shipHealth,
        isReady: p.isReady,
        score: p.score
      }))
    };
  }
}

const rooms = new Map();

module.exports = { GameRoom, rooms, GAME_MODES };
