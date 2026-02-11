import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';

const app = express();
const httpServer = createServer(app);
const PORT = process.env.PORT || 3000;

const io = new Server(httpServer, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST']
    }
});

// ─── GAME STATE ──────────────────────────────────────────────────────
const MAX_HP = 3;
const KILLS_TO_WIN = 20;
const RESPAWN_DELAY_MS = 5000; // 5-second death penalty
const WIN_DISPLAY_MS = 6000;   // Show victory screen for 6 seconds

/**
 * @type {Object.<string, {
 *   x: number, y: number, z: number,
 *   qx: number, qy: number, qz: number, qw: number,
 *   color: string, hat: string, name: string,
 *   hp: number, kills: number, deaths: number,
 *   furColor: number, coatColor: number, hatColor: number, hatType: string
 * }>}
 */
const players = {};
let gameInProgress = true; // False during win screen

// ─── SOCKET.IO EVENTS ─────────────────────────────────────────────────
io.on('connection', (socket) => {
    console.log(`[+] Player connected: ${socket.id}`);

    // ── JOIN ──
    socket.on('join', (data) => {
        const { name, hatType, hatColor, furColor, coatColor } = data;
        console.log(`[JOIN] ${name} (${socket.id})`);

        // Initialize player state
        const spawnX = (Math.random() - 0.5) * 100;
        const spawnZ = (Math.random() - 0.5) * 100;

        players[socket.id] = {
            x: spawnX, y: 2, z: spawnZ,
            qx: 0, qy: 0, qz: 0, qw: 1,
            name: name || 'Anonymous Rat',
            hp: MAX_HP,
            kills: 0,
            deaths: 0,
            hatType: hatType || 'fedora',
            hatColor: hatColor ?? 0xDC4A3C,
            furColor: furColor ?? 0xE8B84D,
            coatColor: coatColor ?? 0xBE4545
        };

        // Send ALL existing players to the new player
        socket.emit('currentPlayers', players);

        // Broadcast to everyone else that a new player joined
        socket.broadcast.emit('playerJoined', {
            id: socket.id,
            ...players[socket.id]
        });

        // Send scoreboard to everyone
        io.emit('scoreboardUpdate', buildScoreboard());
    });

    // ── MOVEMENT UPDATE ──
    socket.on('updateMovement', (data) => {
        if (!players[socket.id]) return;

        const { x, y, z, qx, qy, qz, qw, meshQx, meshQy, meshQz, meshQw } = data;
        const p = players[socket.id];
        p.x = x; p.y = y; p.z = z;
        p.qx = qx; p.qy = qy; p.qz = qz; p.qw = qw;

        // Broadcast to all OTHER players
        socket.broadcast.emit('playerMoved', {
            id: socket.id,
            x, y, z,
            qx, qy, qz, qw,
            meshQx: meshQx ?? 0,
            meshQy: meshQy ?? 0,
            meshQz: meshQz ?? 0,
            meshQw: meshQw ?? 1
        });
    });

    // ── SHOOT ──
    socket.on('shoot', (data) => {
        if (!players[socket.id]) return;

        // Broadcast the visual shot to everyone but the shooter
        socket.broadcast.emit('playerShot', {
            shooterId: socket.id,
            origin: data.origin,
            target: data.target
        });
    });

    // ── HIT (Shooter-Authoritative) ──
    socket.on('hit', (data) => {
        if (!gameInProgress) return; // Ignore hits during win screen

        const { victimId, damage } = data;
        const victim = players[victimId];
        const shooter = players[socket.id];

        if (!victim || !shooter) return;
        if (victim.hp <= 0) return; // Already dead

        victim.hp -= damage;
        console.log(`[HIT] ${shooter.name} hit ${victim.name} for ${damage}dmg (HP: ${victim.hp})`);

        // Broadcast damage to everyone
        io.emit('playerDamaged', {
            id: victimId,
            hp: victim.hp,
            attackerId: socket.id
        });

        // ── DEATH ──
        if (victim.hp <= 0) {
            shooter.kills++;
            victim.deaths++;

            console.log(`[KILL] ${shooter.name} killed ${victim.name} (K:${shooter.kills} D:${victim.deaths})`);

            // Broadcast death
            io.emit('playerDied', {
                victimId,
                killerId: socket.id,
                killerName: shooter.name,
                victimName: victim.name
            });

            // Scoreboard update
            io.emit('scoreboardUpdate', buildScoreboard());

            // ── WIN CONDITION ──
            if (shooter.kills >= KILLS_TO_WIN) {
                console.log(`\n🏆  ${shooter.name} WINS with ${shooter.kills} kills!\n`);
                gameInProgress = false;

                io.emit('gameWon', {
                    winnerId: socket.id,
                    winnerName: shooter.name,
                    kills: shooter.kills
                });

                // After display period, reset the game
                setTimeout(() => {
                    resetGame();
                }, WIN_DISPLAY_MS);

                return; // Don't schedule a normal respawn
            }

            // Respawn after delay (5 seconds)
            setTimeout(() => {
                if (!players[victimId]) return; // Player may have disconnected

                victim.hp = MAX_HP;
                victim.x = (Math.random() - 0.5) * 100;
                victim.y = 2;
                victim.z = (Math.random() - 0.5) * 100;

                io.emit('playerRespawn', {
                    id: victimId,
                    x: victim.x,
                    y: victim.y,
                    z: victim.z,
                    hp: victim.hp
                });
            }, RESPAWN_DELAY_MS);
        }
    });

    // ── DISCONNECT ──
    socket.on('disconnect', () => {
        const name = players[socket.id]?.name || 'Unknown';
        console.log(`[-] Player disconnected: ${name} (${socket.id})`);
        delete players[socket.id];

        socket.broadcast.emit('playerLeft', { id: socket.id });
        io.emit('scoreboardUpdate', buildScoreboard());
    });
});

// ─── HELPERS ──────────────────────────────────────────────────────────
function buildScoreboard() {
    return Object.entries(players).map(([id, p]) => ({
        id,
        name: p.name,
        kills: p.kills,
        deaths: p.deaths
    })).sort((a, b) => b.kills - a.kills || a.deaths - b.deaths);
}

function resetGame() {
    console.log('\n🔄  Resetting game — new round!\n');
    gameInProgress = true;

    // Reset all players' stats and respawn them
    for (const [id, player] of Object.entries(players)) {
        player.kills = 0;
        player.deaths = 0;
        player.hp = MAX_HP;
        player.x = (Math.random() - 0.5) * 100;
        player.y = 2;
        player.z = (Math.random() - 0.5) * 100;

        // Respawn each player
        io.emit('playerRespawn', {
            id,
            x: player.x,
            y: player.y,
            z: player.z,
            hp: player.hp
        });
    }

    // Tell all clients to hide victory screen
    io.emit('gameReset');

    // Updated scoreboard (all zeros)
    io.emit('scoreboardUpdate', buildScoreboard());
}

// ─── START SERVER ─────────────────────────────────────────────────────
httpServer.listen(PORT, () => {
    console.log(`\n🧀  Rat Detective Online — Server running on port ${PORT}\n`);
});
