const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

const PORT = process.env.PORT || 3000;

// Serve static files from 'public' folder
app.use(express.static(path.join(__dirname, 'public')));

// Serve index.html on root
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Game rooms
const rooms = new Map();
const waitingPlayers = [];

io.on('connection', (socket) => {
    console.log(`User connected: ${socket.id}`);

    // Handle finding a match
    socket.on('findMatch', () => {
        if (waitingPlayers.length > 0) {
            const opponent = waitingPlayers.shift();
            const roomId = `room_${Date.now()}`;
            
            rooms.set(roomId, {
                player1: opponent.id,
                player2: socket.id,
                gameState: {
                    player1: null,
                    player2: null
                }
            });
            
            socket.join(roomId);
            opponent.join(roomId);
            
            socket.emit('matchFound', {
                roomId: roomId,
                isPlayer1: false
            });
            
            opponent.emit('matchFound', {
                roomId: roomId,
                isPlayer1: true
            });
            
            socket.to(roomId).emit('playerJoined', {
                playerId: socket.id,
                character: null
            });
            
            socket.emit('playerJoined', {
                playerId: opponent.id,
                character: null
            });
            
            console.log(`Match created: ${roomId}`);
        } else {
            waitingPlayers.push(socket);
            socket.emit('waitingForMatch');
            console.log(`Player ${socket.id} waiting for match`);
        }
    });

    socket.on('gameState', (data) => {
        const room = rooms.get(data.roomId);
        if (room) {
            socket.to(data.roomId).emit('gameState', {
                ...data,
                playerId: socket.id
            });
        }
    });

    socket.on('specialAttack', (data) => {
        const room = rooms.get(data.roomId);
        if (room) {
            socket.to(data.roomId).emit('specialAttack', {
                ...data,
                playerId: socket.id
            });
        }
    });

    socket.on('disconnect', () => {
        console.log(`User disconnected: ${socket.id}`);

        const waitingIndex = waitingPlayers.findIndex(p => p.id === socket.id);
        if (waitingIndex !== -1) {
            waitingPlayers.splice(waitingIndex, 1);
        }

        for (const [roomId, room] of rooms.entries()) {
            if (room.player1 === socket.id || room.player2 === socket.id) {
                socket.to(roomId).emit('playerDisconnected');
                rooms.delete(roomId);
                console.log(`Room ${roomId} deleted due to disconnection`);
                break;
            }
        }
    });
});

server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log('Open http://localhost:3000 to play');
});
