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
    this.logger.debug('Generating stream page HTML');
    
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
   * Generates the watching page HTML with stream viewing functionality
   * This page includes:
   * - Stream viewer interface
   * - Connection status indicators
   * - WebRTC client integration for consuming streams
   */
  generateWatchPage(): string {
    this.logger.debug('Generating watch page HTML');
    
    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>WebRTC Stream - Viewer</title>
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
            max-width: 900px;
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
    <div class="container">
        <h1>📺 Live Stream Viewer</h1>
        <div class="viewer-count" id="viewerCount">👥 Connecting...</div>
        
        <div class="video-container">
            <video id="remoteVideo" autoplay playsinline class="hidden"></video>
            <div id="noStream" class="no-stream">
                <div class="no-stream-icon">📻</div>
                <div>No stream available</div>
                <div style="font-size: 0.9rem; opacity: 0.7;">Waiting for broadcaster to start streaming...</div>
            </div>
        </div>
        
        <div class="controls">
            <button id="refreshBtn" class="refresh-btn">🔄 Refresh</button>
            <button id="streamBtn" class="stream-btn" onclick="window.open('/stream', '_blank')">Start Streaming</button>
        </div>
        
        <div id="status" class="status info">Connecting to stream...</div>
    </div>

    <script src="/socket.io/socket.io.js"></script>
    <script>
        // WebRTC Viewer Client Implementation
        class ViewerClient {
            constructor() {
                this.socket = io();
                this.remoteStream = null;
                this.device = null;
                this.transport = null;
                this.consumer = null;
                this.viewerCount = 0;
                
                this.initializeEventListeners();
                this.initializeSocketEvents();
                this.joinAsViewer();
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
} 