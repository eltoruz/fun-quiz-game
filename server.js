const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const PORT = process.env.PORT || 3001;

const ADMIN_PIN = 'yuni2025';
const RECONNECT_TIMEOUT = 30000; // 30 seconds grace period

// Serve frontend
app.use(express.static(__dirname));

// ===== ROOM MANAGEMENT =====
const rooms = {};
// disconnectTimers: { socketId: timeoutId } — delays player removal on disconnect
const disconnectTimers = {};

function generateRoomCode() {
    let code;
    do {
        code = Math.floor(100000 + Math.random() * 900000).toString();
    } while (rooms[code]);
    return code;
}

function shuffleArray(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

// ===== SOCKET.IO =====
io.on('connection', (socket) => {
    console.log('🔌 Connected:', socket.id);

    // Admin creates a room
    socket.on('create-room', (pin, callback) => {
        if (pin !== ADMIN_PIN) {
            return callback({ success: false, error: 'PIN salah!' });
        }
        const code = generateRoomCode();
        rooms[code] = {
            admin: socket.id,
            adminSessionId: socket.id, // initial session marker
            players: [],
            status: 'waiting',
            questions: []
        };
        socket.join(code);
        socket.roomCode = code;
        socket.isAdmin = true;
        console.log(`🏠 Room ${code} created by admin`);
        callback({ success: true, roomCode: code });
    });

    // Student joins a room
    socket.on('join-room', ({ roomCode, name }, callback) => {
        const room = rooms[roomCode];
        if (!room) {
            return callback({ success: false, error: 'Kode room tidak ditemukan!' });
        }
        if (room.status !== 'waiting') {
            return callback({ success: false, error: 'Kuis sudah dimulai!' });
        }
        if (room.players.find(p => p.name.toLowerCase() === name.toLowerCase() && !p.disconnected)) {
            return callback({ success: false, error: 'Nama sudah dipakai! Gunakan nama lain.' });
        }

        const player = {
            id: socket.id,
            name: name,
            score: 0,
            correct: 0,
            wrong: 0,
            currentQuestion: 0,
            finished: false,
            disconnected: false
        };
        room.players.push(player);
        socket.join(roomCode);
        socket.roomCode = roomCode;
        socket.playerName = name;

        console.log(`👤 ${name} joined room ${roomCode}`);
        callback({ success: true, playerCount: room.players.length });

        // Notify admin about new player
        const activePlayers = room.players.filter(p => !p.disconnected);
        io.to(room.admin).emit('player-joined', {
            players: activePlayers.map(p => ({ name: p.name, score: p.score })),
            count: activePlayers.length
        });
    });

    // ===== RECONNECT =====
    socket.on('reconnect-room', ({ roomCode, name, role }, callback) => {
        const room = rooms[roomCode];
        if (!room) {
            return callback({ success: false, error: 'Room tidak ditemukan!' });
        }

        if (role === 'admin') {
            // Admin reconnecting
            // Clear any pending admin disconnect timer
            if (disconnectTimers[room.admin]) {
                clearTimeout(disconnectTimers[room.admin]);
                delete disconnectTimers[room.admin];
            }
            room.admin = socket.id;
            socket.join(roomCode);
            socket.roomCode = roomCode;
            socket.isAdmin = true;

            console.log(`🔄 Admin reconnected to room ${roomCode}`);

            const activePlayers = room.players.filter(p => !p.disconnected);
            callback({
                success: true,
                roomCode: roomCode,
                status: room.status,
                players: activePlayers.map(p => ({
                    name: p.name,
                    score: p.score,
                    correct: p.correct,
                    wrong: p.wrong,
                    currentQuestion: p.currentQuestion,
                    finished: p.finished
                })),
                count: activePlayers.length
            });
        } else {
            // Student reconnecting
            const player = room.players.find(p => p.name.toLowerCase() === name.toLowerCase());
            if (!player) {
                return callback({ success: false, error: 'Nama tidak ditemukan di room!' });
            }

            // Clear disconnect timer if exists
            if (disconnectTimers[player.id]) {
                clearTimeout(disconnectTimers[player.id]);
                delete disconnectTimers[player.id];
            }

            // Update socket references
            player.id = socket.id;
            player.disconnected = false;
            socket.join(roomCode);
            socket.roomCode = roomCode;
            socket.playerName = name;

            console.log(`🔄 ${name} reconnected to room ${roomCode}`);

            callback({
                success: true,
                roomCode: roomCode,
                status: room.status,
                playerState: {
                    score: player.score,
                    correct: player.correct,
                    wrong: player.wrong,
                    currentQuestion: player.currentQuestion,
                    finished: player.finished
                }
            });

            // Notify admin
            const activePlayers = room.players.filter(p => !p.disconnected);
            io.to(room.admin).emit('player-joined', {
                players: activePlayers.map(p => ({ name: p.name, score: p.score })),
                count: activePlayers.length
            });
        }
    });

    // Admin starts the game
    socket.on('start-game', (callback) => {
        const code = socket.roomCode;
        const room = rooms[code];
        if (!room || room.admin !== socket.id) {
            return callback({ success: false, error: 'Bukan admin!' });
        }
        const activePlayers = room.players.filter(p => !p.disconnected);
        if (activePlayers.length === 0) {
            return callback({ success: false, error: 'Belum ada siswa yang bergabung!' });
        }

        room.status = 'playing';

        // Broadcast start to all players
        socket.to(code).emit('game-started');
        console.log(`🚀 Room ${code} game started with ${activePlayers.length} players`);
        callback({ success: true, playerCount: activePlayers.length });
    });

    // Student submits an answer result
    socket.on('answer-result', ({ correct, score, questionIndex, totalQuestions }) => {
        const code = socket.roomCode;
        const room = rooms[code];
        if (!room) return;

        const player = room.players.find(p => p.id === socket.id);
        if (!player) return;

        player.score = score;
        if (correct) player.correct++;
        else player.wrong++;
        player.currentQuestion = questionIndex + 1;

        // Send live update to admin
        io.to(room.admin).emit('score-update', {
            players: room.players.filter(p => !p.disconnected).map(p => ({
                name: p.name,
                score: p.score,
                correct: p.correct,
                wrong: p.wrong,
                currentQuestion: p.currentQuestion,
                finished: p.finished
            }))
        });
    });

    // Student requests leaderboard
    socket.on('request-leaderboard', () => {
        const code = socket.roomCode;
        const room = rooms[code];
        if (!room) return;

        const leaderboard = room.players.filter(p => !p.disconnected).map(p => ({
            name: p.name,
            score: p.score,
            correct: p.correct,
            finished: p.finished
        }));

        socket.emit('leaderboard-update', { players: leaderboard });
    });

    // Student finishes the quiz
    socket.on('quiz-finished', ({ score, correct, wrong, total, stars }) => {
        const code = socket.roomCode;
        const room = rooms[code];
        if (!room) return;

        const player = room.players.find(p => p.id === socket.id);
        if (!player) return;

        player.score = score;
        player.correct = correct;
        player.wrong = wrong;
        player.finished = true;
        player.stars = stars;

        // Notify admin
        const activePlayers = room.players.filter(p => !p.disconnected);
        io.to(room.admin).emit('score-update', {
            players: activePlayers.map(p => ({
                name: p.name,
                score: p.score,
                correct: p.correct,
                wrong: p.wrong,
                currentQuestion: p.currentQuestion,
                finished: p.finished,
                stars: p.stars || 0
            }))
        });

        // Check if all active players finished
        const allFinished = activePlayers.every(p => p.finished);
        if (allFinished) {
            room.status = 'finished';
            const finalData = {
                players: activePlayers.map(p => ({
                    name: p.name,
                    score: p.score,
                    correct: p.correct,
                    wrong: p.wrong,
                    stars: p.stars || 0
                }))
            };
            io.to(room.admin).emit('all-finished', finalData);
            // Broadcast podium to all students
            socket.to(code).emit('show-podium', finalData);
        }
    });

    // Handle disconnection — delayed cleanup
    socket.on('disconnect', () => {
        const code = socket.roomCode;
        if (!code || !rooms[code]) return;

        const room = rooms[code];

        if (socket.isAdmin) {
            console.log(`⏳ Admin disconnected from room ${code}, waiting ${RECONNECT_TIMEOUT / 1000}s for reconnect...`);
            // Give admin time to reconnect
            disconnectTimers[socket.id] = setTimeout(() => {
                if (rooms[code] && room.admin !== socket.id) {
                    // Admin already reconnected with new socket
                    delete disconnectTimers[socket.id];
                    return;
                }
                socket.to(code).emit('room-closed');
                delete rooms[code];
                delete disconnectTimers[socket.id];
                console.log(`🗑️ Room ${code} deleted (admin didn't reconnect)`);
            }, RECONNECT_TIMEOUT);
        } else {
            // Mark player as disconnected (don't remove yet)
            const player = room.players.find(p => p.id === socket.id);
            if (player) {
                player.disconnected = true;
                console.log(`⏳ ${socket.playerName} disconnected from room ${code}, waiting for reconnect...`);

                // Start disconnect timer
                disconnectTimers[socket.id] = setTimeout(() => {
                    const r = rooms[code];
                    if (!r) { delete disconnectTimers[socket.id]; return; }

                    // Only remove if still disconnected
                    const p = r.players.find(pl => pl.name === socket.playerName && pl.disconnected);
                    if (p) {
                        r.players = r.players.filter(pl => pl !== p);
                        const activePlayers = r.players.filter(pl => !pl.disconnected);
                        io.to(r.admin).emit('player-left', {
                            name: socket.playerName,
                            players: activePlayers.map(pl => ({ name: pl.name, score: pl.score })),
                            count: activePlayers.length
                        });
                        console.log(`👋 ${socket.playerName} removed from room ${code} (didn't reconnect)`);
                    }
                    delete disconnectTimers[socket.id];
                }, RECONNECT_TIMEOUT);
            }
        }
    });
});

server.listen(PORT, () => {
    console.log(`🌟 Kuis Pintar server running at http://localhost:${PORT}`);
});
