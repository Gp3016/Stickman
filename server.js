// server.js
const WebSocket = require('ws');
const http = require('http');
const fs = require('fs');
const path = require('path');

// Create HTTP server to serve the frontend
const server = http.createServer((req, res) => {
    const filePath = path.join(__dirname, req.url === '/' ? 'index.html' : req.url);
    const extname = path.extname(filePath);
    let contentType = 'text/html';

    switch (extname) {
        case '.js':
            contentType = 'text/javascript';
            break;
        case '.css':
            contentType = 'text/css';
            break;
        case '.json':
            contentType = 'application/json';
            break;
        case '.png':
            contentType = 'image/png';
            break;
        case '.jpg':
            contentType = 'image/jpg';
            break;
        case '.ico':
            contentType = 'image/x-icon';
            break;
    }

    fs.readFile(filePath, (err, content) => {
        if (err) {
            if (err.code === 'ENOENT') {
                res.writeHead(404);
                res.end('File not found');
            } else {
                res.writeHead(500);
                res.end('Server error: ' + err.code);
            }
        } else {
            res.writeHead(200, { 'Content-Type': contentType });
            res.end(content, 'utf-8');
        }
    });
});

// Initialize WebSocket server
const wss = new WebSocket.Server({ server });

// Store active rooms and players
const rooms = new Map();
const players = new Map();

function generateRoomCode() {
    return Math.random().toString(36).substr(2, 6).toUpperCase();
}

wss.on('connection', (ws) => {
    console.log('New client connected');
    
    let playerId = null;
    let roomId = null;

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);

            switch (data.type) {
                case 'createRoom':
                    roomId = generateRoomCode();
                    playerId = 'player_' + Math.random().toString(36).substr(2, 9);

                    rooms.set(roomId, {
                        host: playerId,
                        players: new Map(),
                        maxPlayers: 2
                    });

                    rooms.get(roomId).players.set(playerId, {
                        id: playerId,
                        character: null,
                        health: 100,
                        maxHealth: 100
                    });

                    players.set(playerId, { ws, roomId });

                    ws.send(JSON.stringify({
                        type: 'roomCreated',
                        roomId: roomId
                    }));

                    console.log(`Room created: ${roomId} by ${playerId}`);
                    break;

                case 'joinRoom':
                    roomId = data.roomId;
                    playerId = 'player_' + Math.random().toString(36).substr(2, 9);

                    if (rooms.has(roomId)) {
                        const room = rooms.get(roomId);

                        if (room.players.size < room.maxPlayers) {
                            room.players.set(playerId, {
                                id: playerId,
                                character: data.character,
                                health: 100,
                                maxHealth: 100
                            });

                            players.set(playerId, { ws, roomId });

                            broadcastToRoom(roomId, {
                                type: 'playerJoined',
                                playerId,
                                character: data.character
                            });

                            if (room.players.size === room.maxPlayers) {
                                broadcastToRoom(roomId, {
                                    type: 'gameStart'
                                });
                            }

                            console.log(`Player ${playerId} joined room ${roomId}`);
                        } else {
                            ws.send(JSON.stringify({
                                type: 'error',
                                message: 'Room is full'
                            }));
                        }
                    } else {
                        ws.send(JSON.stringify({
                            type: 'error',
                            message: 'Room not found'
                        }));
                    }
                    break;

                case 'gameState':
                    if (roomId && rooms.has(roomId)) {
                        broadcastToRoom(roomId, data, playerId);
                    }
                    break;

                case 'characterSelect':
                    if (roomId && rooms.has(roomId)) {
                        const room = rooms.get(roomId);
                        if (room.players.has(playerId)) {
                            room.players.get(playerId).character = data.character;
                            broadcastToRoom(roomId, {
                                type: 'characterSelected',
                                playerId,
                                character: data.character
                            });
                        }
                    }
                    break;
            }
        } catch (error) {
            console.error('Error parsing message:', error);
            ws.send(JSON.stringify({
                type: 'error',
                message: 'Invalid message format'
            }));
        }
    });

    ws.on('close', () => {
        console.log('Client disconnected');

        if (playerId && roomId) {
            if (rooms.has(roomId)) {
                const room = rooms.get(roomId);
                room.players.delete(playerId);

                broadcastToRoom(roomId, {
                    type: 'playerLeft',
                    playerId
                });

                if (room.players.size === 0) {
                    rooms.delete(roomId);
                    console.log(`Room ${roomId} deleted (empty)`);
                }
            }

            players.delete(playerId);
        }
    });

    ws.on('error', (error) => {
        console.error('WebSocket error:', error);
    });
});

function broadcastToRoom(roomId, message, excludePlayerId = null) {
    if (rooms.has(roomId)) {
        const room = rooms.get(roomId);
        room.players.forEach((player, playerId) => {
            if (playerId !== excludePlayerId && players.has(playerId)) {
                const playerData = players.get(playerId);
                if (playerData.ws.readyState === WebSocket.OPEN) {
                    playerData.ws.send(JSON.stringify(message));
                }
            }
        });
    }
}

setInterval(() => {
    console.log(`Active rooms: ${rooms.size}`);
    console.log(`Active players: ${players.size}`);

    for (const [roomId, room] of rooms.entries()) {
        if (room.players.size === 0) {
            rooms.delete(roomId);
            console.log(`Cleaned up empty room: ${roomId}`);
        }
    }
}, 30000);

// ✅ PORT from environment for Render
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`WebSocket server ready for connections`);
});
