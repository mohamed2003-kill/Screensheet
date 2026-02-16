class TiledFrames {
    constructor(screen, callback = null, options = {}) {
        if (!screen) throw new Error('A valid screen must be provided to start streaming.');

        this.config = {
            fps: options.fps || 10,
            tileSize: options.tileSize || 64,
            quality: options.quality || 0.4, // Lower quality for speed/bandwidth
            callback: callback
        };

        this.screen = screen;
        this.stream = null;
        this.video = document.createElement('video');
        this.canvas = document.createElement('canvas');
        this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
        
        this.previousTiles = new Map();
        this.interval = null;
        this.isRunning = false;
    }

    static async create(screen, callback = null, options = {}) {
        try {
            const instance = new TiledFrames(screen, callback, options);
            await instance.start();
            return instance;
        } catch (error) {
            console.error("Failed to create TiledFrames instance: ", error);
            return null;
        }
    }

    async start() {
        try {
            this.stream = await navigator.mediaDevices.getUserMedia({
                audio: false,
                video: {
                    mandatory: {
                        chromeMediaSource: 'desktop',
                        chromeMediaSourceId: this.screen.display[0].id,
                        minWidth: this.screen.width,
                        minHeight: this.screen.height,
                        maxWidth: this.screen.width,
                        maxHeight: this.screen.height,
                    },
                },
            });

            this.video.srcObject = this.stream;
            await this.video.play();

            this.canvas.width = this.screen.width;
            this.canvas.height = this.screen.height;

            this.isRunning = true;
            this.captureLoop();
        } catch (error) {
            this.stop();
            throw error;
        }
    }

    captureLoop() {
        if (!this.isRunning) return;

        this.processFrame();
        this.interval = setTimeout(() => this.captureLoop(), 1000 / this.config.fps);
    }

    async processFrame() {
        if (this.video.paused || this.video.ended) return;

        this.ctx.drawImage(this.video, 0, 0, this.canvas.width, this.canvas.height);

        const changedTiles = [];
        const { tileSize, quality } = this.config;

        // Small temporary canvas for encoding tiles
        const tileCanvas = document.createElement('canvas');
        tileCanvas.width = tileSize;
        tileCanvas.height = tileSize;
        const tileCtx = tileCanvas.getContext('2d');

        for (let y = 0; y < this.canvas.height; y += tileSize) {
            for (let x = 0; x < this.canvas.width; x += tileSize) {
                const w = Math.min(tileSize, this.canvas.width - x);
                const h = Math.min(tileSize, this.canvas.height - y);
                
                const imageData = this.ctx.getImageData(x, y, w, h);
                const hash = this.computeHash(imageData.data);
                
                const tileId = `${x},${y}`;
                if (this.previousTiles.get(tileId) !== hash) {
                    this.previousTiles.set(tileId, hash);
                    
                    if (tileCanvas.width !== w || tileCanvas.height !== h) {
                        tileCanvas.width = w;
                        tileCanvas.height = h;
                    }

                    tileCtx.putImageData(imageData, 0, 0);
                    const dataUrl = tileCanvas.toDataURL('image/jpeg', quality);
                    changedTiles.push({ x, y, data: dataUrl });
                }
            }
        }

        if (changedTiles.length > 0 && this.config.callback) {
            this.config.callback({
                type: 'tiled',
                width: this.canvas.width,
                height: this.canvas.height,
                tiles: changedTiles
            });
        }
    }

    computeHash(data) {
        let hash = 0;
        // Sampling every 4th pixel for speed
        for (let i = 0; i < data.length; i += 16) { 
            hash = ((hash << 5) - hash) + data[i];
            hash = ((hash << 5) - hash) + data[i+1];
            hash = ((hash << 5) - hash) + data[i+2];
            hash = hash >>> 0;
        }
        return hash;
    }

    stop() {
        this.isRunning = false;
        if (this.interval) clearTimeout(this.interval);
        if (this.stream) {
            this.stream.getTracks().forEach(track => track.stop());
            this.stream = null;
        }
        if (this.video) {
            this.video.pause();
            this.video.srcObject = null;
        }
    }
}

module.exports = TiledFrames;
