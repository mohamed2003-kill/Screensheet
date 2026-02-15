const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*" } // Allow connections from anywhere
});

// Serve the "public" folder (The UI for your phone)
app.use(express.static(path.join(__dirname, 'public')));

// Signaling Logic
io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    // When the PC (Streamer) joins, it registers as "host"
    socket.on('register-host', () => {
        socket.join('host-room');
        console.log('Host registered');
    });

    // When the Phone (Viewer) joins
    socket.on('register-viewer', () => {
        console.log('Viewer waiting for stream');
        // Tell the host a viewer is ready
        io.to('host-room').emit('viewer-connected', socket.id);
    });

    // Relay WebRTC "Offer" (PC -> Phone)
    socket.on('offer', (data) => {
        io.to(data.target).emit('offer', data.payload);
    });

    // Relay WebRTC "Answer" (Phone -> PC)
    socket.on('answer', (data) => {
        io.to('host-room').emit('answer', data.payload);
    });

    // Relay ICE Candidates (Network paths)
    socket.on('ice-candidate', (data) => {
        socket.broadcast.emit('ice-candidate', data);
    });
});

server.listen(3001, () => {
    console.log('Relay server running on port 3001');
});