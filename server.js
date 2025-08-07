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

// Game rooms
const rooms = new Map();
const waitingPlayers = [];

app.use(express.static(path.join(__dirname, 'public')));

io.on('connection', (socket) => {
    console.log(`User connected: ${socket.id}`);

    // Handle finding a match
    socket.on('findMatch', () => {
        // Check if there's a waiting player
        if (waitingPlayers.length > 0) {
            const opponent = waitingPlayers.shift();
            const roomId = `room_${Date.now()}`;
            
            // Create room
            rooms.set(roomId, {
                player1: opponent.id,
                player2: socket.id,
                gameState: {
                    player1: null,
                    player2: null
                }
            });
            
            // Join both players to the room
            socket.join(roomId);
            opponent.join(roomId);
            
            // Notify both players
            socket.emit('matchFound', {
                roomId: roomId,
                isPlayer1: false
            });
            
            opponent.emit('matchFound', {
                roomId: roomId,
                isPlayer1: true
            });
            
            // Notify players about each other
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
            // Add to waiting list
            waitingPlayers.push(socket);
            socket.emit('waitingForMatch');
            console.log(`Player ${socket.id} waiting for match`);
        }
    });
    
    // Handle game state updates
    socket.on('gameState', (data) => {
        const room = rooms.get(data.roomId);
        if (room) {
            // Broadcast to other player in the room
            socket.to(data.roomId).emit('gameState', {
                ...data,
                playerId: socket.id
            });
        }
    });
    
    // Handle special attacks
    socket.on('specialAttack', (data) => {
        const room = rooms.get(data.roomId);
        if (room) {
            // Broadcast to other player in the room
            socket.to(data.roomId).emit('specialAttack', {
                ...data,
                playerId: socket.id
            });
        }
    });
    
    // Handle character selection
    socket.on('selectCharacter', (data) => {
        const room = rooms.get(data.roomId);
        if (room) {
            if (room.player1 === socket.id) {
                room.gameState.player1 = data.character;
            } else if (room.player2 === socket.id) {
                room.gameState.player2 = data.character;
            }
            
            // Broadcast to other player
            socket.to(data.roomId).emit('characterSelected', {
                playerId: socket.id,
                character: data.character
            });
        }
    });
    
    // Handle game ready
    socket.on('gameReady', (data) => {
        const room = rooms.get(data.roomId);
        if (room) {
            // Broadcast to other player
            socket.to(data.roomId).emit('gameReady', {
                playerId: socket.id
            });
        }
    });
    
    // Handle chat messages
    socket.on('chatMessage', (data) => {
        const room = rooms.get(data.roomId);
        if (room) {
            // Broadcast to other player
            socket.to(data.roomId).emit('chatMessage', {
                playerId: socket.id,
                message: data.message
            });
        }
    });
    
    // Handle disconnection
    socket.on('disconnect', () => {
        console.log(`User disconnected: ${socket.id}`);
        
        // Remove from waiting list
        const waitingIndex = waitingPlayers.findIndex(p => p.id === socket.id);
        if (waitingIndex !== -1) {
            waitingPlayers.splice(waitingIndex, 1);
        }
        
        // Notify other player in room
        let roomToDelete = null;
        for (const [roomId, room] of rooms.entries()) {
            if (room.player1 === socket.id || room.player2 === socket.id) {
                socket.to(roomId).emit('playerDisconnected');
                roomToDelete = roomId;
                break;
            }
        }
        
        // Delete room after iteration
        if (roomToDelete) {
            rooms.delete(roomToDelete);
            console.log(`Room ${roomToDelete} deleted due to disconnection`);
        }
    });
});

server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log('Open http://localhost:3000 to play');
});
