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
     * Generates the streaming page HTML with camera access and broadcasting functionality
     * This page includes:
     * - Camera permission request
     * - Local video preview
     * - Stream controls (start/stop)
     * - WebRTC client integration
     */
    generateStreamPage(): string {
        this.logger.debug('Serving stream page HTML');

        return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>WebRTC Stream - Broadcaster</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            display: flex;
            justify-content: center;
            align-items: center;
            color: white;
        }
        
        .container {
            background: rgba(255, 255, 255, 0.1);
            backdrop-filter: blur(10px);
            border-radius: 20px;
            padding: 2rem;
            max-width: 800px;
            width: 90%;
            text-align: center;
            box-shadow: 0 8px 32px rgba(31, 38, 135, 0.37);
            border: 1px solid rgba(255, 255, 255, 0.18);
        }
        
        h1 {
            margin-bottom: 1.5rem;
            font-size: 2.5rem;
            text-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
        }
        
        .video-container {
            position: relative;
            background: #000;
            border-radius: 15px;
            overflow: hidden;
            margin: 1.5rem 0;
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
        }
        
        #localVideo {
            width: 100%;
            height: 400px;
            object-fit: cover;
        }
        
        .controls {
            display: flex;
            gap: 1rem;
            justify-content: center;
            margin-top: 1.5rem;
            flex-wrap: wrap;
        }
        
        button {
            padding: 0.75rem 1.5rem;
            border: none;
            border-radius: 25px;
            font-size: 1rem;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.3s ease;
            box-shadow: 0 4px 15px rgba(0, 0, 0, 0.2);
        }
        
        .start-btn {
            background: linear-gradient(45deg, #4CAF50, #45a049);
            color: white;
        }
        
        .start-btn:hover {
            transform: translateY(-2px);
            box-shadow: 0 6px 20px rgba(76, 175, 80, 0.4);
        }
        
        .stop-btn {
            background: linear-gradient(45deg, #f44336, #da190b);
            color: white;
        }
        
        .stop-btn:hover {
            transform: translateY(-2px);
            box-shadow: 0 6px 20px rgba(244, 67, 54, 0.4);
        }
        
        .watch-btn {
            background: linear-gradient(45deg, #2196F3, #1976D2);
            color: white;
        }
        
        .watch-btn:hover {
            transform: translateY(-2px);
            box-shadow: 0 6px 20px rgba(33, 150, 243, 0.4);
        }
        
        button:disabled {
            opacity: 0.6;
            cursor: not-allowed;
            transform: none !important;
        }
        
        .status {
            margin-top: 1rem;
            padding: 0.75rem;
            border-radius: 10px;
            font-weight: 500;
        }
        
        .status.success {
            background: rgba(76, 175, 80, 0.2);
            border: 1px solid rgba(76, 175, 80, 0.5);
        }
        
        .status.error {
            background: rgba(244, 67, 54, 0.2);
            border: 1px solid rgba(244, 67, 54, 0.5);
        }
        
        .status.info {
            background: rgba(33, 150, 243, 0.2);
            border: 1px solid rgba(33, 150, 243, 0.5);
        }
        
        .hidden {
            display: none;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>🎥 Start Your Stream</h1>
        <p>Click "Start Streaming" to begin broadcasting your camera</p>
        
        <div class="video-container">
            <video id="localVideo" autoplay muted playsinline></video>
        </div>
        
        <div class="controls">
            <button id="startBtn" class="start-btn">Start Streaming</button>
            <button id="stopBtn" class="stop-btn hidden">Stop Streaming</button>
            <button id="watchBtn" class="watch-btn" onclick="window.open('/watch', '_blank')">Open Viewer</button>
        </div>
        
        <div id="status" class="status info">Ready to stream</div>
    </div>

    <script src="/socket.io/socket.io.js"></script>
    <script>
        // WebRTC Streaming Client Implementation
        class StreamingClient {
            constructor() {
                this.socket = io();
                this.localStream = null;
                this.device = null;
                this.transport = null;
                this.producer = null;
                this.isStreaming = false;
                
                this.initializeEventListeners();
                this.initializeSocketEvents();
            }
            
            initializeEventListeners() {
                document.getElementById('startBtn').addEventListener('click', () => this.startStreaming());
                document.getElementById('stopBtn').addEventListener('click', () => this.stopStreaming());
            }
            
            initializeSocketEvents() {
                this.socket.on('connect', () => {
                    this.updateStatus('Connected to server', 'success');
                });
                
                this.socket.on('disconnect', () => {
                    this.updateStatus('Disconnected from server', 'error');
                });
                
                this.socket.on('transport-created', (data) => {
                    this.handleTransportCreated(data);
                });
                
                this.socket.on('producer-created', (data) => {
                    this.updateStatus('Stream started successfully!', 'success');
                    this.toggleControls(true);
                });
                
                this.socket.on('error', (error) => {
                    this.updateStatus('Error: ' + error.message, 'error');
                    console.error('Socket error:', error);
                });
            }
            
            async startStreaming() {
                try {
                    this.updateStatus('Requesting camera access...', 'info');
                    
                    // Get user media (camera and microphone)
                    this.localStream = await navigator.mediaDevices.getUserMedia({
                        video: {
                            width: { ideal: 1280 },
                            height: { ideal: 720 },
                            frameRate: { ideal: 30 }
                        },
                        audio: {
                            echoCancellation: true,
                            noiseSuppression: true,
                            autoGainControl: true
                        }
                    });
                    
                    // Display local video
                    const localVideo = document.getElementById('localVideo');
                    localVideo.srcObject = this.localStream;
                    
                    this.updateStatus('Camera access granted. Initializing stream...', 'info');
                    
                    // Join the streaming room
                    this.socket.emit('join-room', { 
                        roomId: 'main-stream',
                        role: 'streamer'
                    });
                    
                } catch (error) {
                    this.updateStatus('Failed to access camera: ' + error.message, 'error');
                    console.error('Error accessing media devices:', error);
                }
            }
            
            async stopStreaming() {
                try {
                    this.updateStatus('Stopping stream...', 'info');
                    
                    // Stop local stream
                    if (this.localStream) {
                        this.localStream.getTracks().forEach(track => track.stop());
                        this.localStream = null;
                    }
                    
                    // Clear video
                    const localVideo = document.getElementById('localVideo');
                    localVideo.srcObject = null;
                    
                    // Close producer and transport
                    if (this.producer) {
                        this.socket.emit('close-producer', { producerId: this.producer.id });
                        this.producer = null;
                    }
                    
                    // Leave room
                    this.socket.emit('leave-room');
                    
                    this.updateStatus('Stream stopped', 'info');
                    this.toggleControls(false);
                    this.isStreaming = false;
                    
                } catch (error) {
                    this.updateStatus('Error stopping stream: ' + error.message, 'error');
                    console.error('Error stopping stream:', error);
                }
            }
            
            async handleTransportCreated(transportInfo) {
                try {
                    this.updateStatus('Creating WebRTC connection...', 'info');
                    
                    // This would integrate with MediaSoup client library
                    // For now, we'll simulate the process
                    setTimeout(() => {
                        this.socket.emit('transport-connect', {
                            transportId: transportInfo.id,
                            dtlsParameters: {} // Would contain actual DTLS parameters
                        });
                    }, 1000);
                    
                } catch (error) {
                    this.updateStatus('Failed to create transport: ' + error.message, 'error');
                    console.error('Transport creation error:', error);
                }
            }
            
            updateStatus(message, type = 'info') {
                const statusEl = document.getElementById('status');
                statusEl.textContent = message;
                statusEl.className = 'status ' + type;
                console.log('[Status]', message);
            }
            
            toggleControls(isStreaming) {
                const startBtn = document.getElementById('startBtn');
                const stopBtn = document.getElementById('stopBtn');
                
                if (isStreaming) {
                    startBtn.classList.add('hidden');
                    stopBtn.classList.remove('hidden');
                } else {
                    startBtn.classList.remove('hidden');
                    stopBtn.classList.add('hidden');
                }
                
                this.isStreaming = isStreaming;
            }
        }
        
        // Initialize the streaming client when page loads
        document.addEventListener('DOMContentLoaded', () => {
            new StreamingClient();
        });
    </script>
</body>
</html>`;
    }

      /**
   * Generates the watching page HTML with live stream browser functionality
   * This page includes:
   * - List of active live streams
   * - Click to join any stream as viewer
   * - Live viewer interface
   */
  generateWatchPage(): string {
    this.logger.debug('Generating watch page HTML');
    
    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Live Streams - Viewer</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            background: #f8f9fa;
            min-height: 100vh;
            color: #333;
            margin: 0;
            padding: 0;
        }
        
        .header {
            background: white;
            padding: 1rem 2rem;
            border-bottom: 1px solid #e9ecef;
            text-align: center;
        }
        
        h1 {
            font-size: 1.8rem;
            font-weight: 600;
            color: #333;
            margin: 0;
        }
        
        .main-container {
            max-width: 1000px;
            margin: 2rem auto;
            padding: 0 1rem;
        }
        
        .streams-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
            gap: 1.5rem;
            margin-bottom: 2rem;
        }
        
        .stream-card {
            background: white;
            border-radius: 12px;
            padding: 1.5rem;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
            border: 1px solid #e9ecef;
            cursor: pointer;
            transition: all 0.2s ease;
        }
        
        .stream-card:hover {
            transform: translateY(-2px);
            box-shadow: 0 4px 20px rgba(0,0,0,0.15);
            border-color: #007bff;
        }
        
        .stream-card.active {
            border-color: #28a745;
            background: #f8fff9;
        }
        
        .stream-title {
            font-size: 1.1rem;
            font-weight: 600;
            color: #333;
            margin-bottom: 0.5rem;
        }
        
        .stream-info {
            color: #666;
            font-size: 0.9rem;
            margin-bottom: 1rem;
        }
        
        .participant-count {
            display: inline-block;
            background: #e9ecef;
            padding: 0.25rem 0.75rem;
            border-radius: 12px;
            font-size: 0.8rem;
            color: #495057;
            margin-bottom: 1rem;
        }
        
        .stream-card.active .participant-count {
            background: #d4edda;
            color: #155724;
        }
        
        .join-btn {
            background: #007bff;
            color: white;
            border: none;
            padding: 0.5rem 1rem;
            border-radius: 6px;
            font-size: 0.9rem;
            cursor: pointer;
            width: 100%;
            transition: background 0.2s ease;
        }
        
        .join-btn:hover {
            background: #0056b3;
        }
        
        .stream-card.active .join-btn {
            background: #28a745;
        }
        
        .stream-card.active .join-btn:hover {
            background: #1e7e34;
        }
        
        .no-streams {
            text-align: center;
            padding: 4rem 2rem;
            color: #666;
        }
        
        .no-streams h2 {
            font-size: 1.5rem;
            margin-bottom: 1rem;
            font-weight: 500;
        }
        
        .refresh-btn {
            background: #6c757d;
            color: white;
            border: none;
            padding: 0.75rem 1.5rem;
            border-radius: 6px;
            font-size: 0.9rem;
            cursor: pointer;
            margin: 1rem auto;
            display: block;
        }
        
        .refresh-btn:hover {
            background: #5a6268;
        }
        
        .video-container {
            position: relative;
            background: #000;
            border-radius: 15px;
            overflow: hidden;
            margin: 1.5rem 0;
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
            min-height: 400px;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        
        #remoteVideo {
            width: 100%;
            height: 400px;
            object-fit: cover;
        }
        
        .no-stream {
            color: #ccc;
            font-size: 1.2rem;
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 1rem;
        }
        
        .no-stream-icon {
            font-size: 4rem;
            opacity: 0.5;
        }
        
        .controls {
            display: flex;
            gap: 1rem;
            justify-content: center;
            margin-top: 1.5rem;
            flex-wrap: wrap;
        }
        
        button {
            padding: 0.75rem 1.5rem;
            border: none;
            border-radius: 25px;
            font-size: 1rem;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.3s ease;
            box-shadow: 0 4px 15px rgba(0, 0, 0, 0.2);
        }
        
        .refresh-btn {
            background: linear-gradient(45deg, #2196F3, #1976D2);
            color: white;
        }
        
        .refresh-btn:hover {
            transform: translateY(-2px);
            box-shadow: 0 6px 20px rgba(33, 150, 243, 0.4);
        }
        
        .stream-btn {
            background: linear-gradient(45deg, #4CAF50, #45a049);
            color: white;
        }
        
        .stream-btn:hover {
            transform: translateY(-2px);
            box-shadow: 0 6px 20px rgba(76, 175, 80, 0.4);
        }
        
        .status {
            margin-top: 1rem;
            padding: 0.75rem;
            border-radius: 10px;
            font-weight: 500;
        }
        
        .status.success {
            background: rgba(76, 175, 80, 0.2);
            border: 1px solid rgba(76, 175, 80, 0.5);
        }
        
        .status.error {
            background: rgba(244, 67, 54, 0.2);
            border: 1px solid rgba(244, 67, 54, 0.5);
        }
        
        .status.info {
            background: rgba(33, 150, 243, 0.2);
            border: 1px solid rgba(33, 150, 243, 0.5);
        }
        
        .viewer-count {
            background: rgba(255, 255, 255, 0.1);
            padding: 0.5rem 1rem;
            border-radius: 20px;
            display: inline-block;
            margin-top: 1rem;
            font-size: 0.9rem;
        }
        
        .hidden {
            display: none;
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>📺 Live Streams</h1>
    </div>
    
    <div class="main-container">
        <div id="streamsContainer">
            <div class="no-streams" id="noStreams">
                <h2>No live streams available</h2>
                <p>Check back later or start your own conference!</p>
                <button class="refresh-btn" onclick="location.href='/join'">Start Conference</button>
            </div>
        </div>
        
        <button id="refreshBtn" class="refresh-btn">🔄 Refresh Streams</button>
    </div>

    <script src="/socket.io/socket.io.js"></script>
    <script>
        // Live Streams Browser Implementation
        class StreamsBrowser {
            constructor() {
                this.socket = io();
                this.activeStreams = new Map();
                
                this.initializeEventListeners();
                this.initializeSocketEvents();
                this.loadActiveStreams();
            }
            
            initializeEventListeners() {
                document.getElementById('refreshBtn').addEventListener('click', () => this.refresh());
                
                // Auto-refresh every 30 seconds if no stream
                setInterval(() => {
                    if (!this.remoteStream) {
                        this.checkForStream();
                    }
                }, 30000);
            }
            
            initializeSocketEvents() {
                this.socket.on('connect', () => {
                    this.updateStatus('Connected to server', 'success');
                    this.joinAsViewer();
                });
                
                this.socket.on('disconnect', () => {
                    this.updateStatus('Disconnected from server', 'error');
                    this.showNoStream();
                });
                
                this.socket.on('stream-started', (data) => {
                    this.updateStatus('Stream available! Connecting...', 'info');
                    this.requestStream();
                });
                
                this.socket.on('stream-ended', () => {
                    this.updateStatus('Stream ended', 'info');
                    this.showNoStream();
                });
                
                this.socket.on('consumer-created', (data) => {
                    this.handleConsumerCreated(data);
                });
                
                this.socket.on('viewer-count', (count) => {
                    this.updateViewerCount(count);
                });
                
                this.socket.on('no-stream', () => {
                    this.updateStatus('No active stream found', 'info');
                    this.showNoStream();
                });
                
                this.socket.on('error', (error) => {
                    this.updateStatus('Error: ' + error.message, 'error');
                    console.error('Socket error:', error);
                });
            }
            
            joinAsViewer() {
                this.socket.emit('join-room', { 
                    roomId: 'main-stream',
                    role: 'viewer'
                });
            }
            
            requestStream() {
                this.updateStatus('Requesting stream access...', 'info');
                this.socket.emit('request-stream');
            }
            
            refresh() {
                this.updateStatus('Refreshing...', 'info');
                this.socket.disconnect();
                setTimeout(() => {
                    this.socket.connect();
                }, 1000);
            }
            
            checkForStream() {
                this.socket.emit('check-stream');
            }
            
            handleConsumerCreated(consumerData) {
                try {
                    this.updateStatus('Stream connected successfully!', 'success');
                    
                    // This would integrate with MediaSoup client library
                    // For demonstration, we'll simulate receiving the stream
                    this.simulateStreamReceived();
                    
                } catch (error) {
                    this.updateStatus('Failed to connect to stream: ' + error.message, 'error');
                    console.error('Consumer creation error:', error);
                }
            }
            
            simulateStreamReceived() {
                // In a real implementation, this would handle the actual MediaSoup consumer
                const remoteVideo = document.getElementById('remoteVideo');
                const noStream = document.getElementById('noStream');
                
                // Hide "no stream" message and show video element
                noStream.classList.add('hidden');
                remoteVideo.classList.remove('hidden');
                
                // Note: In a real implementation, you would set remoteVideo.srcObject to the actual stream
                this.updateStatus('Live stream active', 'success');
            }
            
            showNoStream() {
                const remoteVideo = document.getElementById('remoteVideo');
                const noStream = document.getElementById('noStream');
                
                remoteVideo.classList.add('hidden');
                noStream.classList.remove('hidden');
                
                if (this.remoteStream) {
                    // Stop remote stream if it exists
                    this.remoteStream.getTracks().forEach(track => track.stop());
                    this.remoteStream = null;
                }
                
                remoteVideo.srcObject = null;
            }
            
            updateStatus(message, type = 'info') {
                const statusEl = document.getElementById('status');
                statusEl.textContent = message;
                statusEl.className = 'status ' + type;
                console.log('[Status]', message);
            }
            
            updateViewerCount(count) {
                const viewerCountEl = document.getElementById('viewerCount');
                this.viewerCount = count;
                viewerCountEl.textContent = \`👥 \${count} viewer\${count !== 1 ? 's' : ''}\`;
            }
        }
        
        // Initialize the viewer client when page loads
        document.addEventListener('DOMContentLoaded', () => {
            new ViewerClient();
        });
    </script>
</body>
</html>`;
    }

    /**
     * Generates the conference page HTML with multi-participant video functionality
     * This page includes:
     * - Multi-participant video grid
     * - Camera and microphone controls
     * - Participant list and status
     * - Real-time joining/leaving notifications
     */
    generateConferencePage(): string {
        this.logger.debug('Generating conference page HTML');
        
        return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Video Conference</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            background: #f8f9fa;
            min-height: 100vh;
            color: #333;
        }
        
        .header {
            background: white;
            padding: 1rem 2rem;
            border-bottom: 1px solid #e9ecef;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
        
        .header h1 {
            font-size: 1.5rem;
            font-weight: 600;
            color: #333;
        }
        
        .participant-count {
            background: #f1f3f4;
            padding: 0.5rem 1rem;
            border-radius: 20px;
            font-size: 0.9rem;
            color: #666;
        }
        
        .main-container {
            padding: 2rem;
            max-width: 1200px;
            margin: 0 auto;
        }
        
        .controls {
            display: flex;
            gap: 1rem;
            justify-content: center;
            margin-bottom: 2rem;
            flex-wrap: wrap;
        }
        
        .control-btn {
            padding: 0.75rem 1.5rem;
            border: 1px solid #ddd;
            border-radius: 8px;
            background: white;
            cursor: pointer;
            font-size: 0.9rem;
            transition: all 0.2s ease;
            color: #333;
            min-height: 44px; /* Minimum touch target for mobile */
            min-width: 100px;
        }
        
        .control-btn:hover {
            background: #f8f9fa;
            border-color: #999;
        }
        
        .control-btn.primary {
            background: #007bff;
            color: white;
            border-color: #007bff;
        }
        
        .control-btn.primary:hover {
            background: #0056b3;
        }
        
        .control-btn.danger {
            background: #dc3545;
            color: white;
            border-color: #dc3545;
        }
        
        .control-btn.danger:hover {
            background: #c82333;
        }
        
        .control-btn.active {
            background: #28a745;
            color: white;
            border-color: #28a745;
        }
        
        .control-btn:disabled {
            opacity: 0.5;
            cursor: not-allowed;
        }
        
        .video-grid {
            display: grid;
            gap: 1rem;
            grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
            min-height: 400px;
        }
        
        .video-participant {
            position: relative;
            background: #000;
            border-radius: 8px;
            overflow: hidden;
            border: 2px solid #e9ecef;
        }
        
        .video-participant.local {
            border-color: #007bff;
        }
        
        .participant-video {
            width: 100%;
            height: 100%;
            object-fit: cover;
            min-height: 200px;
        }
        
        .participant-info {
            position: absolute;
            bottom: 8px;
            left: 8px;
            background: rgba(0, 0, 0, 0.7);
            padding: 0.25rem 0.5rem;
            border-radius: 4px;
            font-size: 0.8rem;
            color: white;
            display: flex;
            align-items: center;
            gap: 0.5rem;
        }
        
        .status-indicator {
            width: 6px;
            height: 6px;
            border-radius: 50%;
            background: #28a745;
        }
        
        .status-indicator.muted {
            background: #dc3545;
        }
        
        .no-video-placeholder {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            height: 200px;
            color: #666;
            background: #f8f9fa;
        }
        
        .no-video-icon {
            font-size: 2rem;
            margin-bottom: 0.5rem;
        }
        
        .empty-state {
            text-align: center;
            color: #666;
            padding: 4rem 2rem;
        }
        
        .empty-state h2 {
            font-size: 1.5rem;
            margin-bottom: 1rem;
            font-weight: 500;
        }
        
        .empty-state p {
            font-size: 1rem;
            line-height: 1.5;
        }
        
        .status {
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 0.75rem 1rem;
            border-radius: 4px;
            font-size: 0.9rem;
            z-index: 1000;
            max-width: 300px;
        }
        
        .status.success {
            background: #d4edda;
            color: #155724;
            border: 1px solid #c3e6cb;
        }
        
        .status.error {
            background: #f8d7da;
            color: #721c24;
            border: 1px solid #f5c6cb;
        }
        
        .status.info {
            background: #d1ecf1;
            color: #0c5460;
            border: 1px solid #bee5eb;
        }
        
        .hidden {
            display: none;
        }
        
        @media (max-width: 768px) {
            .header {
                padding: 1rem;
                flex-direction: column;
                gap: 0.5rem;
                text-align: center;
            }
            
            .main-container {
                padding: 1rem;
            }
            
            .controls {
                gap: 0.5rem;
                justify-content: stretch;
            }
            
            .control-btn {
                flex: 1;
                min-width: 120px;
                min-height: 48px; /* Larger touch targets on mobile */
                font-size: 1rem;
            }
            
            .video-grid {
                grid-template-columns: 1fr;
                gap: 0.5rem;
            }
            
            .video-participant {
                min-height: 250px; /* Larger video on mobile */
            }
            
            .status {
                position: fixed;
                top: 10px;
                left: 10px;
                right: 10px;
                max-width: none;
                text-align: center;
            }
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>Video Conference</h1>
        <div class="participant-count" id="participantCount">0 participants</div>
    </div>
    
    <div class="main-container">
        <div class="controls">
            <button id="joinBtn" class="control-btn primary">Join Conference</button>
            <button id="leaveBtn" class="control-btn danger hidden">Leave Conference</button>
            <button id="muteBtn" class="control-btn">🎤 Mic</button>
            <button id="videoBtn" class="control-btn active">📷 Camera</button>
        </div>
        
        <div class="video-grid" id="videoGrid">
            <div class="empty-state" id="emptyState">
                <h2>Ready to start</h2>
                <p>Click "Join Conference" to start your video call</p>
            </div>
        </div>
    </div>
    
    <div id="status" class="status info hidden">Ready to join conference</div>

    <script src="/socket.io/socket.io.js"></script>
    <script>
        // Simplified Conference Client Implementation
        class ConferenceClient {
            constructor() {
                this.socket = io();
                this.localStream = null;
                this.localVideo = null;
                this.participants = new Map(); // participantId -> { element, stream, peerConnection }
                this.isJoined = false;
                this.isMuted = false;
                this.isVideoEnabled = true;
                this.myParticipantId = null;
                this.peerConnections = new Map(); // participantId -> RTCPeerConnection
                
                this.checkBrowserSupport();
                this.initializeEventListeners();
                this.initializeSocketEvents();
            }
            
            checkBrowserSupport() {
                // Check HTTPS requirement
                if (location.protocol !== 'https:' && location.hostname !== 'localhost') {
                    this.updateStatus('Camera requires HTTPS. Please use https:// or localhost', 'error');
                    return;
                }
                
                // Check browser support
                if (!navigator.mediaDevices) {
                    this.updateStatus('Camera not supported in this browser', 'error');
                    return;
                }
                
                // Log available devices for debugging
                if (navigator.mediaDevices.enumerateDevices) {
                    navigator.mediaDevices.enumerateDevices()
                        .then(devices => {
                            const videoDevices = devices.filter(device => device.kind === 'videoinput');
                            console.log('Available video devices:', videoDevices.length);
                            if (videoDevices.length === 0) {
                                this.updateStatus('No camera found on this device', 'error');
                            }
                        })
                        .catch(err => console.warn('Could not enumerate devices:', err));
                }
            }
            
            initializeEventListeners() {
                // Use both click and touchend for better mobile support
                document.getElementById('joinBtn').addEventListener('click', (e) => {
                    e.preventDefault();
                    this.joinConference();
                });
                document.getElementById('leaveBtn').addEventListener('click', (e) => {
                    e.preventDefault();
                    this.leaveConference();
                });
                document.getElementById('muteBtn').addEventListener('click', (e) => {
                    e.preventDefault();
                    this.toggleMute();
                });
                document.getElementById('videoBtn').addEventListener('click', (e) => {
                    e.preventDefault();
                    this.toggleVideo();
                });
                
                // Add visual feedback for mobile touch
                document.querySelectorAll('.control-btn').forEach(btn => {
                    btn.addEventListener('touchstart', () => {
                        btn.style.transform = 'scale(0.95)';
                    });
                    btn.addEventListener('touchend', () => {
                        btn.style.transform = 'scale(1)';
                    });
                });
            }
            
            initializeSocketEvents() {
                this.socket.on('connect', () => {
                    this.updateStatus('Connected', 'success');
                });
                
                this.socket.on('disconnect', () => {
                    this.updateStatus('Disconnected', 'error');
                    this.resetConference();
                });
                
                this.socket.on('conference-joined', (data) => {
                    this.handleConferenceJoined(data);
                });
                
                this.socket.on('participant-joined', (data) => {
                    this.handleParticipantJoined(data);
                });
                
                this.socket.on('participant-left', (data) => {
                    this.handleParticipantLeft(data);
                });
                
                this.socket.on('participant-started-streaming', (data) => {
                    this.handleParticipantStartedStreaming(data);
                });
                
                this.socket.on('participant-stopped-streaming', (data) => {
                    this.handleParticipantStoppedStreaming(data);
                });
                
                // WebRTC signaling events
                this.socket.on('webrtc-offer', (data) => {
                    this.handleWebRTCOffer(data);
                });
                
                this.socket.on('webrtc-answer', (data) => {
                    this.handleWebRTCAnswer(data);
                });
                
                this.socket.on('webrtc-ice-candidate', (data) => {
                    this.handleICECandidate(data);
                });
                
                this.socket.on('participant-count', (count) => {
                    this.updateParticipantCount(count);
                });
                
                this.socket.on('participants-list', (participants) => {
                    console.log('Received participants list:', participants);
                    this.handleParticipantsList(participants);
                });
                
                this.socket.on('transport-created', (data) => {
                    console.log('Transport created:', data);
                    this.handleTransportCreated(data);
                });
                
                this.socket.on('producer-created', (data) => {
                    console.log('Producer created:', data);
                    this.updateStatus('Sharing video with others', 'success');
                });
                
                this.socket.on('consumer-created', (data) => {
                    console.log('Consumer created:', data);
                    this.handleConsumerCreated(data);
                });
                
                this.socket.on('new-producer', (data) => {
                    console.log('New producer available:', data);
                    this.handleNewProducer(data);
                });
                
                this.socket.on('router-capabilities', (data) => {
                    console.log('Received router capabilities:', data);
                    this.routerCapabilities = data.rtpCapabilities;
                });
                
                this.socket.on('error', (error) => {
                    console.error('Socket error:', error);
                    this.updateStatus('Error: ' + error.message, 'error');
                });
            }
            
            async joinConference() {
                try {
                    this.updateStatus('Requesting camera access...', 'info');
                    
                    // Check if getUserMedia is supported
                    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                        throw new Error('Camera not supported on this browser');
                    }
                    
                    // Mobile-friendly camera constraints
                    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
                    
                    const constraints = {
                        video: {
                            width: { ideal: isMobile ? 480 : 640, max: 1280 },
                            height: { ideal: isMobile ? 360 : 480, max: 720 },
                            facingMode: 'user', // Front camera on mobile
                            frameRate: { ideal: isMobile ? 15 : 30, max: 30 } // Lower framerate for mobile
                        },
                        audio: {
                            echoCancellation: true,
                            noiseSuppression: true,
                            autoGainControl: true
                        }
                    };
                    
                    // Try to get media with full constraints first
                    try {
                        this.localStream = await navigator.mediaDevices.getUserMedia(constraints);
                    } catch (err) {
                        console.warn('Failed with full constraints, trying video only:', err);
                        // Fallback to video only if audio fails
                        try {
                            this.localStream = await navigator.mediaDevices.getUserMedia({
                                video: constraints.video
                            });
                            this.updateStatus('Camera access granted (audio unavailable)', 'info');
                        } catch (videoErr) {
                            console.warn('Failed with video only, trying basic constraints:', videoErr);
                            // Final fallback with basic constraints
                            this.localStream = await navigator.mediaDevices.getUserMedia({
                                video: true,
                                audio: false
                            });
                            this.updateStatus('Basic camera access granted', 'info');
                        }
                    }
                    
                    if (!this.localStream) {
                        throw new Error('Failed to access camera');
                    }
                    
                    this.createLocalVideoParticipant();
                    this.hideEmptyState();
                    this.updateStatus('Joining conference...', 'info');
                    
                    this.socket.emit('join-room', { 
                        roomId: 'conference-room',
                        role: 'participant',
                        displayName: 'User-' + Math.random().toString(36).substr(2, 6)
                    });
                    
                } catch (error) {
                    console.error('Join conference error:', error);
                    let errorMessage = 'Camera access failed';
                    
                    if (error.name === 'NotAllowedError') {
                        errorMessage = 'Camera permission denied. Please allow camera access and try again.';
                    } else if (error.name === 'NotFoundError') {
                        errorMessage = 'No camera found on this device.';
                    } else if (error.name === 'NotSupportedError') {
                        errorMessage = 'Camera not supported on this browser.';
                    } else if (error.name === 'NotReadableError') {
                        errorMessage = 'Camera is being used by another application.';
                    } else if (error.message) {
                        errorMessage = error.message;
                    }
                    
                    this.updateStatus(errorMessage, 'error');
                    this.showCameraPermissionHelp();
                }
            }
            
            async leaveConference() {
                try {
                    if (this.localStream) {
                        this.localStream.getTracks().forEach(track => track.stop());
                        this.localStream = null;
                    }
                    
                    if (this.localVideo) {
                        this.localVideo.remove();
                        this.localVideo = null;
                    }
                    
                    // Close all peer connections
                    this.peerConnections.forEach((peerConnection, participantId) => {
                        peerConnection.close();
                    });
                    this.peerConnections.clear();
                    
                    this.participants.clear();
                    this.socket.emit('leave-room');
                    this.resetConference();
                    this.showEmptyState();
                    this.updateStatus('Left conference', 'info');
                    
                } catch (error) {
                    this.updateStatus('Error leaving', 'error');
                }
            }
            
            toggleMute() {
                if (!this.localStream) return;
                
                const audioTrack = this.localStream.getAudioTracks()[0];
                if (audioTrack) {
                    audioTrack.enabled = !audioTrack.enabled;
                    this.isMuted = !audioTrack.enabled;
                    
                    const muteBtn = document.getElementById('muteBtn');
                    muteBtn.textContent = this.isMuted ? '🔇 Muted' : '🎤 Mic';
                    muteBtn.classList.toggle('active', !this.isMuted);
                    
                    this.updateLocalVideoIndicator();
                }
            }
            
            toggleVideo() {
                if (!this.localStream) return;
                
                const videoTrack = this.localStream.getVideoTracks()[0];
                if (videoTrack) {
                    videoTrack.enabled = !videoTrack.enabled;
                    this.isVideoEnabled = videoTrack.enabled;
                    
                    const videoBtn = document.getElementById('videoBtn');
                    videoBtn.textContent = this.isVideoEnabled ? '📷 Camera' : '📷 Off';
                    videoBtn.classList.toggle('active', this.isVideoEnabled);
                    
                    this.updateLocalVideoDisplay();
                }
            }
            
            createLocalVideoParticipant() {
                const videoGrid = document.getElementById('videoGrid');
                
                const participantDiv = document.createElement('div');
                participantDiv.className = 'video-participant local';
                participantDiv.id = 'local-participant';
                
                const video = document.createElement('video');
                video.className = 'participant-video';
                video.autoplay = true;
                video.muted = true;
                video.playsInline = true;
                video.controls = false;
                video.srcObject = this.localStream;
                
                // Handle video load errors
                video.addEventListener('loadedmetadata', () => {
                    console.log('Local video loaded successfully');
                    // Force video to play on iOS Safari
                    video.play().catch(e => console.warn('Auto-play failed:', e));
                });
                video.addEventListener('error', (e) => {
                    console.error('Video error:', e);
                    this.updateStatus('Video display error', 'error');
                });
                
                // iOS Safari specific: sometimes needs manual play trigger
                setTimeout(() => {
                    if (video.paused) {
                        video.play().catch(e => console.warn('Delayed play failed:', e));
                    }
                }, 100);
                
                const info = document.createElement('div');
                info.className = 'participant-info';
                info.innerHTML = \`
                    <div class="status-indicator"></div>
                    <span>You</span>
                \`;
                
                participantDiv.appendChild(video);
                participantDiv.appendChild(info);
                videoGrid.appendChild(participantDiv);
                
                this.localVideo = participantDiv;
                this.updateLocalVideoIndicator();
            }
            
            updateLocalVideoDisplay() {
                if (!this.localVideo) return;
                
                const video = this.localVideo.querySelector('.participant-video');
                
                if (this.isVideoEnabled) {
                    video.style.display = 'block';
                } else {
                    video.style.display = 'none';
                }
            }
            
            updateLocalVideoIndicator() {
                if (!this.localVideo) return;
                
                const indicator = this.localVideo.querySelector('.status-indicator');
                if (indicator) {
                    indicator.classList.toggle('muted', this.isMuted);
                }
            }
            
            handleConferenceJoined(data) {
                this.isJoined = true;
                this.myParticipantId = data.participantId;
                this.toggleControls(true);
                this.updateStatus('Joined conference', 'success');
                
                console.log('Conference joined successfully:', data);
                this.socket.emit('get-participants');
                
                // Start producing our media immediately after joining
                setTimeout(() => {
                    this.startProducing();
                }, 1000);
            }
            
            handleParticipantJoined(data) {
                const { participant } = data;
                console.log('Participant joined:', participant);
                this.updateStatus(\`\${participant.displayName} joined\`, 'info');
                
                // Request to consume their media if they're producing
                if (participant.producers && participant.producers.length > 0) {
                    console.log('New participant has producers, requesting consumption');
                    this.requestConsumption(participant);
                }
            }
            
            handleParticipantLeft(data) {
                const { participantId, displayName } = data;
                
                const participantElement = document.getElementById(\`participant-\${participantId}\`);
                if (participantElement) {
                    participantElement.remove();
                }
                
                this.participants.delete(participantId);
                this.updateStatus(\`\${displayName} left\`, 'info');
            }
            
            async handleParticipantStartedStreaming(data) {
                const { participant } = data;
                console.log('Participant started streaming:', participant);
                
                // Create video element for this participant if not exists
                if (!this.participants.has(participant.id)) {
                    this.createRemoteVideoParticipant(participant);
                }
                
                // Create WebRTC peer connection to get their video
                await this.createPeerConnection(participant.id);
                
                this.updateStatus(participant.displayName + ' started sharing video', 'info');
            }
            
            handleParticipantStoppedStreaming(data) {
                const { participantId } = data;
                
                const participantElement = document.getElementById(\`participant-\${participantId}\`);
                if (participantElement) {
                    participantElement.remove();
                }
                
                this.participants.delete(participantId);
            }
            
            createRemoteVideoParticipant(participant) {
                const videoGrid = document.getElementById('videoGrid');
                
                const participantDiv = document.createElement('div');
                participantDiv.className = 'video-participant';
                participantDiv.id = 'participant-' + participant.id;
                
                // For now, create a placeholder since we're simulating the remote video
                // In a real implementation, this would be a video element with the remote stream
                const placeholder = document.createElement('div');
                placeholder.className = 'no-video-placeholder';
                placeholder.innerHTML = \`
                    <div class="no-video-icon">👤</div>
                    <div>\${participant.displayName}</div>
                    <div style="font-size: 0.8rem; opacity: 0.7; margin-top: 0.5rem;">
                        Video connecting...
                    </div>
                \`;
                
                // Simulate receiving video after a delay
                setTimeout(() => {
                    placeholder.innerHTML = \`
                        <div class="no-video-icon">📹</div>
                        <div>\${participant.displayName}</div>
                        <div style="font-size: 0.8rem; opacity: 0.7; margin-top: 0.5rem;">
                            Video stream active
                        </div>
                    \`;
                    participantDiv.style.background = '#1a1a1a';
                }, 2000);
                
                const info = document.createElement('div');
                info.className = 'participant-info';
                info.innerHTML = \`
                    <div class="status-indicator"></div>
                    <span>\${participant.displayName}</span>
                \`;
                
                participantDiv.appendChild(placeholder);
                participantDiv.appendChild(info);
                videoGrid.appendChild(participantDiv);
                
                this.participants.set(participant.id, {
                    element: participantDiv,
                    participant: participant
                });
            }
            
            updateParticipantCount(count) {
                const participantCountEl = document.getElementById('participantCount');
                participantCountEl.textContent = \`\${count} participant\${count !== 1 ? 's' : ''}\`;
            }
            
            hideEmptyState() {
                const emptyState = document.getElementById('emptyState');
                if (emptyState) emptyState.style.display = 'none';
            }
            
            showEmptyState() {
                const videoGrid = document.getElementById('videoGrid');
                videoGrid.innerHTML = \`
                    <div class="empty-state" id="emptyState">
                        <h2>Ready to start</h2>
                        <p>Click "Join Conference" to start your video call</p>
                    </div>
                \`;
            }
            
            showCameraPermissionHelp() {
                const videoGrid = document.getElementById('videoGrid');
                videoGrid.innerHTML = \`
                    <div class="empty-state" id="emptyState">
                        <h2>📷 Camera Access Needed</h2>
                        <p style="margin-bottom: 1rem;">To join the video conference, please:</p>
                        <div style="text-align: left; max-width: 400px; margin: 0 auto;">
                            <p style="margin-bottom: 0.5rem;">1. Allow camera access when prompted</p>
                            <p style="margin-bottom: 0.5rem;">2. Use HTTPS (not HTTP) if not on localhost</p>
                            <p style="margin-bottom: 0.5rem;">3. Check your browser settings for camera permissions</p>
                            <p style="margin-bottom: 0.5rem;">4. Make sure no other app is using your camera</p>
                            <p style="margin-bottom: 1rem;">5. Try refreshing the page</p>
                        </div>
                        <button onclick="location.reload()" style="padding: 0.5rem 1rem; border: 1px solid #007bff; background: #007bff; color: white; border-radius: 4px; cursor: pointer;">
                            Refresh Page
                        </button>
                    </div>
                \`;
            }

            async startProducing() {
                if (!this.localStream || !this.isJoined) {
                    console.log('Cannot start producing: no stream or not joined');
                    return;
                }

                try {
                    console.log('Starting media production...');
                    
                    // Notify server that we're starting to stream
                    this.socket.emit('start-streaming', {
                        participantId: this.myParticipantId
                    });
                    
                    this.updateStatus('Sharing video with others', 'success');
                    
                } catch (error) {
                    console.error('Error starting production:', error);
                    this.updateStatus('Failed to start video sharing', 'error');
                }
            }

            async requestConsumption(participant, producer = null) {
                if (!this.isJoined) {
                    console.log('Cannot request consumption: not joined');
                    return;
                }

                try {
                    console.log('Requesting consumption for participant:', participant.id);
                    
                    // Create consumer transport if we don't have one
                    this.socket.emit('create-transport', { type: 'consumer' });
                    
                    // If we have specific producer info, request consumption
                    if (producer) {
                        console.log('Requesting consumption of producer:', producer.id);
                        this.socket.emit('request-consume', {
                            participantId: participant.id,
                            producerId: producer.id
                        });
                    }
                    
                } catch (error) {
                    console.error('Error requesting consumption:', error);
                }
            }

            handleParticipantsList(participants) {
                console.log('Processing participants list:', participants);
                
                participants.forEach(participant => {
                    if (participant.id !== this.myParticipantId) {
                        // Create video element for each remote participant
                        if (!this.participants.has(participant.id)) {
                            console.log('Creating remote participant:', participant.displayName);
                            this.createRemoteVideoParticipant(participant);
                        }
                    }
                });
            }

            handleTransportCreated(data) {
                const { transportInfo, type } = data;
              
                
                if (type === 'producer' && this.localStream) {
                    // Connect the transport and start producing
                    this.socket.emit('connect-transport', {
                        transportId: transportInfo.id,
                        dtlsParameters: {} // In real implementation, this would have actual DTLS params
                    });
                    
                    // Start producing video and audio
                    const videoTrack = this.localStream.getVideoTracks()[0];
                    const audioTrack = this.localStream.getAudioTracks()[0];
                    
                    if (videoTrack) {
                        console.log('Starting video production');
                        this.socket.emit('produce', {
                            transportId: transportInfo.id,
                            kind: 'video',
                            rtpParameters: {} // In real implementation, this would have actual RTP params
                        });
                    }
                    
                    if (audioTrack) {
                        console.log('Starting audio production');
                        this.socket.emit('produce', {
                            transportId: transportInfo.id,
                            kind: 'audio',
                            rtpParameters: {} // In real implementation, this would have actual RTP params
                        });
                    }
                } else if (type === 'consumer') {
                    // Connect consumer transport
                    this.socket.emit('connect-transport', {
                        transportId: transportInfo.id,
                        dtlsParameters: {} // In real implementation, this would have actual DTLS params
                    });
                }
            }

            handleConsumerCreated(data) {
                const { consumer } = data;
                console.log('Consumer created for remote stream:', consumer);
                
                // In a real implementation, this would set up the actual media stream
                // For now, we'll simulate receiving the remote video
                this.updateStatus('Connected to remote participant', 'success');
            }

            handleNewProducer(data) {
                const { producer, streamerId } = data;
                console.log('New producer from participant:', streamerId, producer);
                
                // Request to consume this new producer
                if (this.routerCapabilities) {
                    this.socket.emit('consume', {
                        transportId: 'consumer-transport-id', // Would be actual transport ID
                        producerId: producer.id,
                        rtpCapabilities: this.routerCapabilities
                    });
                }
            }
            
            async createPeerConnection(participantId) {
                try {
                    // Create RTCPeerConnection
                    const peerConnection = new RTCPeerConnection({
                        iceServers: [
                            { urls: 'stun:stun.l.google.com:19302' },
                            { urls: 'stun:stun1.l.google.com:19302' }
                        ]
                    });

                    this.peerConnections.set(participantId, peerConnection);

                    // Add local stream to peer connection
                    if (this.localStream) {
                        this.localStream.getTracks().forEach(track => {
                            peerConnection.addTrack(track, this.localStream);
                        });
                    }

                    // Handle incoming remote stream
                    peerConnection.ontrack = (event) => {
                        console.log('Received remote stream from:', participantId);
                        const remoteStream = event.streams[0];
                        this.displayRemoteVideo(participantId, remoteStream);
                    };

                    // Handle ICE candidates
                    peerConnection.onicecandidate = (event) => {
                        if (event.candidate) {
                            this.socket.emit('webrtc-ice-candidate', {
                                targetParticipant: participantId,
                                candidate: event.candidate
                            });
                        }
                    };

                    // Create and send offer
                    const offer = await peerConnection.createOffer();
                    await peerConnection.setLocalDescription(offer);

                    this.socket.emit('webrtc-offer', {
                        targetParticipant: participantId,
                        offer: offer
                    });

                    console.log('Created peer connection and sent offer to:', participantId);

                } catch (error) {
                    console.error('Error creating peer connection:', error);
                }
            }

            async handleWebRTCOffer(data) {
                const { fromParticipant, offer } = data;
                console.log('Received WebRTC offer from:', fromParticipant);

                try {
                    const peerConnection = new RTCPeerConnection({
                        iceServers: [
                            { urls: 'stun:stun.l.google.com:19302' },
                            { urls: 'stun:stun1.l.google.com:19302' }
                        ]
                    });

                    this.peerConnections.set(fromParticipant, peerConnection);

                    // Add local stream
                    if (this.localStream) {
                        this.localStream.getTracks().forEach(track => {
                            peerConnection.addTrack(track, this.localStream);
                        });
                    }

                    // Handle incoming remote stream
                    peerConnection.ontrack = (event) => {
                        console.log('Received remote stream from:', fromParticipant);
                        const remoteStream = event.streams[0];
                        this.displayRemoteVideo(fromParticipant, remoteStream);
                    };

                    // Handle ICE candidates
                    peerConnection.onicecandidate = (event) => {
                        if (event.candidate) {
                            this.socket.emit('webrtc-ice-candidate', {
                                targetParticipant: fromParticipant,
                                candidate: event.candidate
                            });
                        }
                    };

                    // Set remote description and create answer
                    await peerConnection.setRemoteDescription(offer);
                    const answer = await peerConnection.createAnswer();
                    await peerConnection.setLocalDescription(answer);

                    this.socket.emit('webrtc-answer', {
                        targetParticipant: fromParticipant,
                        answer: answer
                    });

                } catch (error) {
                    console.error('Error handling WebRTC offer:', error);
                }
            }

            async handleWebRTCAnswer(data) {
                const { fromParticipant, answer } = data;
                console.log('Received WebRTC answer from:', fromParticipant);

                try {
                    const peerConnection = this.peerConnections.get(fromParticipant);
                    if (peerConnection) {
                        await peerConnection.setRemoteDescription(answer);
                    }
                } catch (error) {
                    console.error('Error handling WebRTC answer:', error);
                }
            }

            async handleICECandidate(data) {
                const { fromParticipant, candidate } = data;
                console.log('Received ICE candidate from:', fromParticipant);

                try {
                    const peerConnection = this.peerConnections.get(fromParticipant);
                    if (peerConnection) {
                        await peerConnection.addIceCandidate(candidate);
                    }
                } catch (error) {
                    console.error('Error handling ICE candidate:', error);
                }
            }

            displayRemoteVideo(participantId, remoteStream) {
                console.log('Displaying remote video for participant:', participantId);
                
                const participantData = this.participants.get(participantId);
                if (!participantData) {
                    console.warn('Participant element not found for:', participantId);
                    return;
                }

                const participantElement = participantData.element;
                
                // Remove placeholder and add video element
                const placeholder = participantElement.querySelector('.no-video-placeholder');
                if (placeholder) {
                    placeholder.remove();
                }

                // Create video element for remote stream
                let videoElement = participantElement.querySelector('.participant-video');
                if (!videoElement) {
                    videoElement = document.createElement('video');
                    videoElement.className = 'participant-video';
                    videoElement.autoplay = true;
                    videoElement.playsInline = true;
                    videoElement.controls = false;
                    participantElement.appendChild(videoElement);
                }

                videoElement.srcObject = remoteStream;
                
                // Update participant data
                participantData.stream = remoteStream;
                this.participants.set(participantId, participantData);

                this.updateStatus('Video connection established', 'success');
            }
            
            resetConference() {
                this.isJoined = false;
                this.toggleControls(false);
                this.participants.clear();
                this.updateParticipantCount(0);
            }
            
            toggleControls(isJoined) {
                const joinBtn = document.getElementById('joinBtn');
                const leaveBtn = document.getElementById('leaveBtn');
                
                if (isJoined) {
                    joinBtn.classList.add('hidden');
                    leaveBtn.classList.remove('hidden');
                } else {
                    joinBtn.classList.remove('hidden');
                    leaveBtn.classList.add('hidden');
                }
            }
            
            updateStatus(message, type = 'info') {
                const statusEl = document.getElementById('status');
                statusEl.textContent = message;
                statusEl.className = 'status ' + type;
                statusEl.classList.remove('hidden');
                
                // Log status for debugging
                
                
                // Keep error messages visible longer
                const hideTimeout = type === 'error' ? 8000 : 3000;
                setTimeout(() => {
                    statusEl.classList.add('hidden');
                }, hideTimeout);
            }
        }
        
        document.addEventListener('DOMContentLoaded', () => {
            new ConferenceClient();
        });
    </script>
</body>
</html>`;
    }
} 