const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const { promisify } = require('util');

let db;

async function initDatabase() {
  return new Promise((resolve, reject) => {
    db = new sqlite3.Database(path.join(__dirname, 'game.db'), (err) => {
      if (err) {
        console.error('Database connection error:', err);
        reject(err);
      } else {
        console.log('📁 Database connected');
        
        // Create tables
        db.run(`
          CREATE TABLE IF NOT EXISTS games (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            room_id TEXT NOT NULL,
            game_mode TEXT NOT NULL,
            started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            ended_at DATETIME
          )
        `);
        
        db.run(`
          CREATE TABLE IF NOT EXISTS players (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            game_id INTEGER,
            player_id TEXT NOT NULL,
            player_name TEXT NOT NULL,
            team INTEGER,
            score INTEGER DEFAULT 0,
            FOREIGN KEY (game_id) REFERENCES games(id)
          )
        `);
        
        db.run(`
          CREATE TABLE IF NOT EXISTS leaderboard (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            player_name TEXT NOT NULL,
            total_score INTEGER DEFAULT 0,
            games_played INTEGER DEFAULT 0,
            games_won INTEGER DEFAULT 0,
            last_played DATETIME DEFAULT CURRENT_TIMESTAMP
          )
        `);
        
        resolve();
      }
    });
  });
}

async function saveGameResult(room) {
  if (!db) return;
  
  try {
    // Insert game record
    const gameId = await new Promise((resolve, reject) => {
      db.run(
        'INSERT INTO games (room_id, game_mode, ended_at) VALUES (?, ?, ?)',
        [room.roomId, room.gameMode, new Date().toISOString()],
        function(err) {
          if (err) reject(err);
          else resolve(this.lastID);
        }
      );
    });
    
    // Insert player records
    for (const [playerId, player] of room.players) {
      await new Promise((resolve, reject) => {
        db.run(
          'INSERT INTO players (game_id, player_id, player_name, team, score) VALUES (?, ?, ?, ?, ?)',
          [gameId, playerId, player.name, player.team, player.score],
          (err) => {
            if (err) reject(err);
            else resolve();
          }
        );
      });
      
      // Update leaderboard
      await new Promise((resolve, reject) => {
        db.run(
          `INSERT INTO leaderboard (player_name, total_score, games_played, games_won) 
           VALUES (?, ?, 1, ?)
           ON CONFLICT(player_name) DO UPDATE SET
           total_score = total_score + ?,
           games_played = games_played + 1,
           games_won = games_won + ?,
           last_played = CURRENT_TIMESTAMP`,
          [player.name, player.score, player.score >= 50 ? 1 : 0, player.score, player.score >= 50 ? 1 : 0],
          (err) => {
            if (err) reject(err);
            else resolve();
          }
        );
      });
    }
    
    console.log(`💾 Game saved to database: ${room.roomId}`);
  } catch (err) {
    console.error('Error saving game:', err);
  }
}

async function getLeaderboard(limit = 10) {
  if (!db) return [];
  
  return new Promise((resolve, reject) => {
    db.all(
      `SELECT player_name, total_score, games_played, games_won 
       FROM leaderboard 
       ORDER BY total_score DESC 
       LIMIT ?`,
      [limit],
      (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      }
    );
  });
}

module.exports = { initDatabase, saveGameResult, getLeaderboard };
