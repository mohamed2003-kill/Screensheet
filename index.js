const { screen } = require("@nut-tree-fork/nut-js");
const { app: electron, BrowserWindow, ipcMain, desktopCapturer, systemPreferences } = require('electron');
const { pointerEvent, keyboardEvent, scrollEvent } = require('./remote');
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');
const ioClient = require('socket.io-client');

const settingsPath = path.join((electron.isPackaged ? electron.getPath('userData') : __dirname), 'settings.json');
let settings;
let window;
let socket;

// UPDATE THIS TO YOUR VPS IP/DOMAIN
const VPS_URL = 'http://217.77.5.245:3001';

function connectToRelay() {
    socket = ioClient(VPS_URL);

    socket.on('connect', () => {
        console.log('Connected to Universal Bridge');
        socket.emit('register-host');
    });

    // The Universal Bridge relays EVERYTHING. We catch it all here.
    socket.onAny((eventName, payload) => {
        if (!window) return;
        
        console.log(`[RELAY] Received event: ${eventName}`);

        // Map relay events back to the internal Electron names the app expects
        switch (eventName) {
            case 'session:request':
                window.webContents.send('session:request', { 
                    sessionId: payload.viewerId, 
                    ip: payload.ip || "Remote Connection", 
                    auth: payload.auth,
                    code: payload.code
                });
                break;
            case 'session:answer':
                // Wrap the received payload back into the structure preload expects
                window.webContents.send('session:answer', { 
                    sessionId: payload.viewerId, 
                    answer: { type: payload.type, sdp: payload.sdp } 
                });
                break;
            case 'webrtc:candidate':
                window.webContents.send('webrtc:candidate', payload.candidate);
                break;
            case 'nutjs:pointer':
                pointerEvent(payload);
                break;
            case 'nutjs:keyboard':
                keyboardEvent(payload);
                break;
            case 'nutjs:scroll':
                scrollEvent(payload);
                break;
        }
    });
}

function createWindow() {
    window = new BrowserWindow({
        width: 400,
        height: 590,
        resizable: false,
        icon: path.join(__dirname, 'public', 'logo.png'),
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: true,
            preload: path.join(__dirname, 'app', 'preload.js'),
        },
    });

    window.setMenuBarVisibility(false);
    window.loadFile(path.join(__dirname, 'app', 'index.html'));

    window.once('ready-to-show', () => {
        window.show();
    });

    window.on('closed', () => {
        window = null;
    });
}

electron.whenReady().then(async () => {
    if (process.platform === 'darwin') {
        const permission = systemPreferences.getMediaAccessStatus('screen');
        if (permission !== 'granted') {
            await systemPreferences.askForMediaAccess('screen');
        }
    }

    createWindow();
    connectToRelay();

    electron.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

electron.on('window-all-closed', () => {
    if (process.platform !== 'darwin') electron.quit();
});

ipcMain.handle('display', async () => {
    try {
        const display = await desktopCapturer.getSources({ types: ['screen', 'window'] });
        const width = await screen.width();
        const height = await screen.height();
        return { display, width, height };
    } catch (error) {
        return new Error(error);
    }
});

ipcMain.handle('session:start', async (event) => {
    return Math.random().toString(36).substring(2, 10).toUpperCase();
});

ipcMain.handle('session:stop', async (event) => {
    return true;
});

// Sends responses (offers, etc) back to the relay
ipcMain.handle('session:response', async (event, payload) => {
    // payload contains { sessionId, offer, type, declined }
    console.log(`[REPLY] Sending session response to ${payload.sessionId}`);
    socket.emit('session:offer', payload);
});

ipcMain.handle('webrtc:candidate', async (event, payload) => {
    socket.emit('webrtc:candidate', payload);
});

ipcMain.handle('settings:load', async () => settings);
ipcMain.handle('settings:update', async (event, modified) => {
    try {
        if (modified?.password) modified.password = await bcrypt.hash(modified.password, 10);
        settings = { ...settings, ...modified };
        fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 4));
        return settings;
    } catch (error) {
        return settings;
    }
});

(async () => {
    const defaults = { port: 3000, audio: true, control: true, theme: true, method: 'webrtc' };
    settings = fs.existsSync(settingsPath) ? { ...defaults, ...JSON.parse(fs.readFileSync(settingsPath, 'utf8')) } : defaults;
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 4));
})();
