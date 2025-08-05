// server.js
const WebSocket = require('ws');
const http = require('http');
const fs = require('fs');
const path = require('path');

// Create HTTP server to serve the frontend
const server = http.createServer((req, res) => {
    // Serve the main HTML file
    if (req.url === '/' || req.url === '/index.html') {
        fs.readFile(path.join(__dirname, 'index.html'), (err, data) => {
            if (err) {
                res.writeHead(500);
                res.end('Error loading index.html');
            } else {
                res.writeHead(200, { 'Content-Type': 'text/html' });
                res.end(data);
            }
        });
    } else {
        // For any other route, try to serve static files
        const filePath = path.join(__dirname, req.url);
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
                res.end(content, '\n');
            }
        });
    }
});

// Initialize WebSocket server
const wss = new WebSocket.Server({ server });

// Store active rooms and players
const rooms = new Map();
const players = new Map();

// Generate unique room codes
function generateRoomCode() {
    return Math.random().toString(36).substr(2, 6).toUpperCase();
}

// Handle WebSocket connections
wss.on('connection', (ws) => {
    console.log('New client connected');
    
    let playerId = null;
    let roomId = null;

    // Handle messages from clients
    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            
            switch (data.type) {
                case 'createRoom':
                    // Create a new room
                    roomId = generateRoomCode();
                    playerId = 'player_' + Math.random().toString(36).substr(2, 9);
                    
                    // Initialize room
                    rooms.set(roomId, {
                        host: playerId,
                        players: new Map(),
                        maxPlayers: 2
                    });
                    
                    // Add player to room
                    rooms.get(roomId).players.set(playerId, {
                        id: playerId,
                        character: null,
                        health: 100,
                        maxHealth: 100
                    });
                    
                    // Store player connection
                    players.set(playerId, {
                        ws: ws,
                        roomId: roomId
                    });
                    
                    // Send room created confirmation
                    ws.send(JSON.stringify({
                        type: 'roomCreated',
                        roomId: roomId
                    }));
                    
                    console.log(`Room created: ${roomId} by ${playerId}`);
                    break;
                    
                case 'joinRoom':
                    // Join an existing room
                    roomId = data.roomId;
                    playerId = 'player_' + Math.random().toString(36).substr(2, 9);
                    
                    if (rooms.has(roomId)) {
                        const room = rooms.get(roomId);
                        
                        if (room.players.size < room.maxPlayers) {
                            // Add player to room
                            room.players.set(playerId, {
                                id: playerId,
                                character: data.character,
                                health: 100,
                                maxHealth: 100
                            });
                            
                            // Store player connection
                            players.set(playerId, {
                                ws: ws,
                                roomId: roomId
                            });
                            
                            // Notify all players in the room
                            broadcastToRoom(roomId, {
                                type: 'playerJoined',
                                playerId: playerId,
                                character: data.character
                            });
                            
                            // If room is full, start the game
                            if (room.players.size === room.maxPlayers) {
                                broadcastToRoom(roomId, {
                                    type: 'gameStart'
                                });
                            }
                            
                            console.log(`Player ${playerId} joined room ${roomId}`);
                        } else {
                            // Room is full
                            ws.send(JSON.stringify({
                                type: 'error',
                                message: 'Room is full'
                            }));
                        }
                    } else {
                        // Room doesn't exist
                        ws.send(JSON.stringify({
                            type: 'error',
                            message: 'Room not found'
                        }));
                    }
                    break;
                    
                case 'gameState':
                    // Update game state for all players in the room
                    if (roomId && rooms.has(roomId)) {
                        // Broadcast game state to all players in the room except sender
                        broadcastToRoom(roomId, data, playerId);
                    }
                    break;
                    
                case 'characterSelect':
                    // Update player's selected character
                    if (roomId && rooms.has(roomId)) {
                        const room = rooms.get(roomId);
                        if (room.players.has(playerId)) {
                            room.players.get(playerId).character = data.character;
                            
                            // Broadcast character selection to room
                            broadcastToRoom(roomId, {
                                type: 'characterSelected',
                                playerId: playerId,
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

    // Handle connection close
    ws.on('close', () => {
        console.log('Client disconnected');
        
        if (playerId && roomId) {
            // Remove player from room
            if (rooms.has(roomId)) {
                const room = rooms.get(roomId);
                room.players.delete(playerId);
                
                // Notify remaining players
                broadcastToRoom(roomId, {
                    type: 'playerLeft',
                    playerId: playerId
                });
                
                // If room is empty, remove it
                if (room.players.size === 0) {
                    rooms.delete(roomId);
                    console.log(`Room ${roomId} deleted (empty)`);
                }
            }
            
            // Remove player from players map
            players.delete(playerId);
        }
    });

    // Handle errors
    ws.on('error', (error) => {
        console.error('WebSocket error:', error);
    });
});

// Broadcast message to all players in a room
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

// Clean up empty rooms periodically
setInterval(() => {
    console.log(`Active rooms: ${rooms.size}`);
    console.log(`Active players: ${players.size}`);
    
    // Remove empty rooms
    for (const [roomId, room] of rooms.entries()) {
        if (room.players.size === 0) {
            rooms.delete(roomId);
            console.log(`Cleaned up empty room: ${roomId}`);
        }
    }
}, 30000); // Check every 30 seconds

// Start the server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`WebSocket server ready for connections`);
});
