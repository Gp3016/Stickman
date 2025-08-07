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
                    player1: { x: 100, y: 300, health: 100, character: null },
                    player2: { x: 700
