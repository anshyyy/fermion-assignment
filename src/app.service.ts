import { Injectable, Logger } from '@nestjs/common';

/**
 * Main application service
 * Generates HTML pages with embedded WebRTC client functionality
 * Follows the Single Responsibility Principle by handling UI generation
 */
@Injectable()
export class AppService {
    private readonly logger = new Logger(AppService.name);

    /**
     * Generates a simple watch page - browse live streams
     * Users can join as guest (with camera) or watch as viewer (no camera)
     */
    generateWatchPage(): string {
        this.logger.debug('Generating simple watch page HTML');

        return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Watch Live Streams</title>
    <link rel="stylesheet" href="/public/css/styles.css">
</head>
<body>
    <div class="container">
        <h1>📺 Live Streams</h1>
        
        <div id="streamsList">
            <div class="empty-state" id="emptyState">
                <h2>📭 No live streams</h2>
                <p>No one is streaming right now</p>
                <br>
                <a href="/stream" class="btn">Start Your Stream</a>
            </div>
        </div>
        
        <div class="controls">
            <button id="refreshBtn" class="btn">🔄 Refresh</button>
            <button id="debugBtn" class="btn" style="background: #dc3545;">🧪 Debug Stream Status</button>
        </div>
    </div>

    <script src="/socket.io/socket.io.js"></script>
    <script src="/public/js/watch-client.js"></script>
</body>
</html>`;
    }

    /**
     * Generates a simple stream hosting page
     * Host starts stream, guests can join with camera, viewers can watch
     */
    generateSimpleStreamPage(): string {
        this.logger.debug('Generating simple stream page HTML');

        return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Start Stream</title>
    <link rel="stylesheet" href="/public/css/styles.css">
</head>
<body>
    <div class="container">
        <h1>📹 Start Your Stream</h1>
        <p>Click "Start Stream" to go live and let others join</p>
        
        <div class="controls">
            <button id="startBtn" class="btn">Start Stream</button>
            <button id="stopBtn" class="btn hidden">Stop Stream</button>
            <button id="muteBtn" class="btn">🎤 Mic</button>
            <button id="videoBtn" class="btn">📷 Camera</button>
            <button id="testRemoveBtn" class="btn" style="background: #dc3545;">🧪 Test Remove</button>
        </div>
            
        <div id="status" class="status">Ready to start streaming</div>
        
        <div id="streamInfo" class="hidden">
            <p><strong>🔴 Stream is live!</strong> Others can now join or watch</p>
            <p>Send them to: <strong>/watch</strong></p>
        </div>
        
        <!-- Unified video grid for host + guests -->
        <div id="videoGrid" class="video-grid">
            <div class="video-preview" id="videoPreview">
                <div style="display: flex; align-items: center; justify-content: center; height: 100%; color: #ccc;">
                    📹 Ready to stream
                </div>
            </div>
        </div>
    </div>

    <script src="/socket.io/socket.io.js"></script>
    <script src="/public/js/stream-client.js"></script>
</body>
</html>`;
    }
} 