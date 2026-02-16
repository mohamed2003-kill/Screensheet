const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    },
    allowEIO3: true // Support older socket.io clients if needed
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
    socket.on('session:request', (data) => {
        let ip = socket.handshake.address;
        if (ip.startsWith('::ffff:')) ip = ip.split('::ffff:')[1];
        
        console.log('Viewer requesting session:', socket.id, 'from', ip);
        io.to('host-room').emit('session:request', { 
            ...data, 
            viewerId: socket.id, 
            ip: ip 
        });
    });

    // Relay WebRTC "Offer" (Host -> Viewer)
    socket.on('session:offer', (data) => {
        console.log('Relaying offer to:', data.sessionId);
        io.to(data.sessionId).emit('session:offer', data);
    });

    // Relay WebRTC "Answer" (Viewer -> Host)
    socket.on('session:answer', (data) => {
        console.log('Relaying answer from:', socket.id);
        io.to('host-room').emit('session:answer', { 
            ...data, 
            viewerId: socket.id 
        });
    });

    // Relay ICE Candidates (Network paths)
    socket.on('webrtc:candidate', (data) => {
        if (data.sessionId) {
            io.to(data.sessionId).emit('webrtc:candidate', data);
        } else {
            io.to('host-room').emit('webrtc:candidate', { 
                ...data, 
                viewerId: socket.id 
            });
        }
    });

    // Relay video frames to the VPS (for WebSocket mode)
    socket.on('stream:frame', (data) => {
        // Broadcast frames to all viewers in the room or specific session
        socket.broadcast.emit('stream:frame', data);
    });

    socket.on('session:disconnect', (data) => {
        if (data && data.sessionId) {
            io.to(data.sessionId).emit('session:disconnect');
        } else {
            io.to('host-room').emit('session:disconnect', { viewerId: socket.id });
        }
    });

    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
        io.to('host-room').emit('session:disconnect', { viewerId: socket.id });
    });
});

server.listen(3001, '0.0.0.0', () => {
    console.log('Relay server running on port 3001');
});