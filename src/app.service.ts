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
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            background: #f5f5f5;
            min-height: 100vh;
            color: #333;
            margin: 0;
            padding: 0;
        }
        
        .header {
            background: white;
            padding: 1rem 2rem;
            border-bottom: 1px solid #ddd;
            text-align: center;
        }
        
        h1 {
            font-size: 1.8rem;
            font-weight: 600;
            color: #333;
            margin: 0;
        }
        
        .container {
            max-width: 800px;
            margin: 2rem auto;
            padding: 0 1rem;
        }
        
        .stream-list {
            display: flex;
            flex-direction: column;
            gap: 1rem;
        }
        
        .stream-item {
            background: white;
            border-radius: 8px;
            padding: 1.5rem;
            box-shadow: 0 2px 8px rgba(0,0,0,0.1);
            border: 1px solid #ddd;
        }
        
        .stream-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 1rem;
        }
        
        .stream-title {
            font-size: 1.2rem;
            font-weight: 600;
            color: #333;
        }
        
        .live-badge {
            background: #dc3545;
            color: white;
            padding: 0.25rem 0.5rem;
            border-radius: 4px;
            font-size: 0.8rem;
            font-weight: 500;
        }
        
        .stream-info {
            color: #666;
            margin-bottom: 1rem;
        }
        
        .stream-actions {
            display: flex;
            gap: 1rem;
            flex-wrap: wrap;
        }
        
        .btn {
            padding: 0.5rem 1rem;
            border: none;
            border-radius: 6px;
            font-size: 0.9rem;
            cursor: pointer;
            transition: all 0.2s;
            text-decoration: none;
            display: inline-block;
            text-align: center;
            min-width: 100px;
        }
        
        .btn-primary { background: #007bff; color: white; }
        .btn-primary:hover { background: #0056b3; }
        
        .btn-success { background: #28a745; color: white; }
        .btn-success:hover { background: #1e7e34; }
        
        .empty-state {
            text-align: center;
            padding: 4rem 2rem;
            color: #666;
        }
        
        .empty-state h2 {
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
            cursor: pointer;
            margin: 2rem auto;
            display: block;
        }
        
        .refresh-btn:hover { background: #5a6268; }
        
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
    
    <div class="container">
        <div id="streamsList" class="stream-list">
            <div class="empty-state" id="emptyState">
                <h2>No live streams</h2>
                <p>No one is streaming right now</p>
                <a href="/stream" class="btn btn-primary" style="margin-top: 1rem;">Start Your Stream</a>
            </div>
        </div>
        
        <button id="refreshBtn" class="refresh-btn">🔄 Refresh</button>
    </div>

        <script src="/socket.io/socket.io.js"></script>
    <script>
                        class StreamsBrowser {
            constructor() {
                this.socket = io();
                this.isViewing = false;
                
                this.socket.on('connect', () => {
                    console.log('✅ Connected to server');
                    this.checkAndJoinStream();
                });
                
                this.socket.on('disconnect', () => {
                    console.log('❌ Disconnected from server');
                });
                
                this.socket.on('stream-ended', () => {
                    console.log('📺 Stream ended, going back to browse mode');
                    this.showBrowseMode();
                });
                
                document.getElementById('refreshBtn').onclick = () => this.checkAndJoinStream();
                
                // Auto-refresh every 10 seconds
                setInterval(() => {
                    if (!this.isViewing) {
                        this.checkAndJoinStream();
                    }
                }, 10000);
            }
            
            checkAndJoinStream() {
                console.log('🔄 Checking for live streams...');
                this.socket.emit('get-stream-status', (status) => {
                    console.log('📊 Received stream status:', status);
                    
                    if (status && status.isLive) {
                        console.log('🔴 Live stream found - auto-joining as viewer');
                        this.joinAsViewer(status);
                    } else {
                        console.log('📭 No live stream - showing browse mode');
                        this.showBrowseMode();
                    }
                });
            }
            
                         joinAsViewer(status) {
                 this.isViewing = true;
                 this.participants = new Map();
                 
                 // Update UI to viewer mode
                 document.body.innerHTML = 
                     '<div class="header">' +
                         '<h1>📺 Watching Live</h1>' +
                         '<div style="color: #666; font-size: 0.9rem;">Viewing ' + (status.hostName || 'Live Stream') + '</div>' +
                     '</div>' +
                     '<div class="container">' +
                         '<div style="text-align: center; margin-bottom: 1rem;">' +
                             '<div class="live-badge" style="display: inline-block; background: #dc3545; color: white; padding: 0.5rem 1rem; border-radius: 4px; font-size: 0.9rem;">🔴 LIVE</div>' +
                             '<div id="participantCount" style="margin-top: 0.5rem; color: #666;">👥 ' + status.participantCount + ' people connected</div>' +
                         '</div>' +
                         '<div id="liveVideoGrid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 1rem; min-height: 300px;">' +
                             '<div id="loadingMessage" style="background: #f8f9fa; height: 300px; border-radius: 8px; display: flex; align-items: center; justify-content: center; color: #666; font-size: 1.1rem; border: 2px dashed #ddd;">📹 Loading live participants...</div>' +
                         '</div>' +
                         '<div style="text-align: center; margin-top: 2rem;">' +
                             '<button id="joinStreamBtn" class="btn btn-success">Join Stream</button>' +
                             '<button id="refreshBtn" class="btn" style="background: #6c757d; color: white; margin-left: 1rem;">Refresh</button>' +
                         '</div>' +
                     '</div>';
                 
                 // Add event listeners (no inline handlers)
                 document.getElementById('joinStreamBtn').onclick = () => {
                     window.location.href = '/stream';
                 };
                 document.getElementById('refreshBtn').onclick = () => {
                     window.location.href = '/watch';
                 };
                 
                 // Setup viewer socket events
                 this.setupViewerEvents();
                 
                 // Join as viewer
                 this.socket.emit('join-stream-as-viewer');
                 console.log('👀 Joined as viewer');
             }
             
             setupViewerEvents() {
                 // Listen for live participants
                 this.socket.on('participants-update', (participants) => {
                     console.log('📊 Received participants update:', participants);
                     this.displayLiveParticipants(participants);
                 });
                 
                 this.socket.on('participant-joined', (data) => {
                     console.log('🎤 Participant joined:', data);
                     this.addLiveParticipant(data.participant);
                 });
                 
                 this.socket.on('participant-left', (data) => {
                     console.log('👋 Participant left:', data);
                     this.removeLiveParticipant(data.participantId);
                 });
                 
                 this.socket.on('participant-count-update', (count) => {
                     const countEl = document.getElementById('participantCount');
                     if (countEl) {
                         countEl.textContent = '👥 ' + count + ' people connected';
                     }
                 });
             }
             
             displayLiveParticipants(participants) {
                 const grid = document.getElementById('liveVideoGrid');
                 if (!grid) return;
                 
                 // Clear loading message
                 const loading = document.getElementById('loadingMessage');
                 if (loading) loading.remove();
                 
                 // Clear existing participants
                 this.participants.clear();
                 grid.innerHTML = '';
                 
                 const liveParticipants = participants.filter(p => p.isHost || p.isGuest);
                 
                 if (liveParticipants.length === 0) {
                     grid.innerHTML = '<div style="background: #f8f9fa; height: 300px; border-radius: 8px; display: flex; align-items: center; justify-content: center; color: #666; font-size: 1.1rem; border: 2px dashed #ddd;">📭 No one is streaming right now</div>';
                     return;
                 }
                 
                 liveParticipants.forEach(participant => {
                     this.addLiveParticipant(participant);
                 });
             }
             
             addLiveParticipant(participant) {
                 const grid = document.getElementById('liveVideoGrid');
                 if (!grid) return;
                 
                 const participantCard = document.createElement('div');
                 participantCard.className = 'participant-card';
                 participantCard.id = 'viewer-participant-' + participant.id;
                 participantCard.style.cssText = 'position: relative; background: #000; border-radius: 8px; overflow: hidden; height: 300px;';
                 
                 // Create video element (simulated for now)
                 const videoElement = document.createElement('div');
                 videoElement.style.cssText = 'width: 100%; height: 100%; background: linear-gradient(45deg, #667eea, #764ba2); display: flex; align-items: center; justify-content: center; color: white; font-size: 1.2rem; flex-direction: column;';
                 
                 videoElement.innerHTML = 
                     '<div style="font-size: 3rem; margin-bottom: 0.5rem;">📹</div>' +
                     '<div style="font-weight: 600;">' + (participant.hostName || participant.guestName || 'Participant') + '</div>' +
                     '<div style="font-size: 0.9rem; opacity: 0.8; margin-top: 0.25rem;">' + (participant.isHost ? 'Host' : 'Guest') + '</div>';
                 
                 const nameTag = document.createElement('div');
                 nameTag.style.cssText = 'position: absolute; bottom: 8px; left: 8px; background: rgba(0,0,0,0.7); color: white; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.8rem;';
                 nameTag.textContent = participant.isHost ? '🎥 ' + (participant.hostName || 'Host') : '🎤 ' + (participant.guestName || 'Guest');
                 
                 participantCard.appendChild(videoElement);
                 participantCard.appendChild(nameTag);
                 grid.appendChild(participantCard);
                 
                 this.participants.set(participant.id, participantCard);
             }
             
             removeLiveParticipant(participantId) {
                 const element = this.participants.get(participantId);
                 if (element) {
                     element.remove();
                     this.participants.delete(participantId);
                 }
                 
                 // Check if grid is empty
                 const grid = document.getElementById('liveVideoGrid');
                 if (grid && this.participants.size === 0) {
                     grid.innerHTML = '<div style="background: #f8f9fa; height: 300px; border-radius: 8px; display: flex; align-items: center; justify-content: center; color: #666; font-size: 1.1rem; border: 2px dashed #ddd;">📭 Stream ended</div>';
                 }
             }
            
            showBrowseMode() {
                this.isViewing = false;
                
                // Reset to browse mode
                const streamsList = document.getElementById('streamsList');
                const emptyState = document.getElementById('emptyState');
                
                if (streamsList && emptyState) {
                    streamsList.innerHTML = '';
                    streamsList.appendChild(emptyState);
                }
            }
        }
        
        // These functions are no longer needed since everything is automatic
        // Keeping them for any remaining references
        function joinAsGuest() {
            window.location.href = '/stream';
        }
        
        function watchStream() {
            window.location.href = '/watch';
        }
        
        // Auto-check if we should join as viewer
        new StreamsBrowser();
    </script>
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
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            background: #f5f5f5;
            min-height: 100vh;
            color: #333;
        }
        
        .header {
            background: white;
            padding: 1rem 2rem;
            border-bottom: 1px solid #ddd;
            text-align: center;
        }
        
        .container {
            max-width: 800px;
            margin: 2rem auto;
            padding: 0 1rem;
        }
        
        .stream-box {
            background: white;
            border-radius: 8px;
            padding: 2rem;
            text-align: center;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }
        
        .video-preview {
            width: 100%;
            height: 300px;
            background: #000;
            border-radius: 8px;
            margin: 1rem 0;
            display: flex;
            align-items: center;
            justify-content: center;
            color: white;
            font-size: 1.2rem;
        }
        
        .video-element {
            width: 100%;
            height: 100%;
            object-fit: cover;
            border-radius: 8px;
        }
        
        .controls {
            display: flex;
            gap: 1rem;
            justify-content: center;
            margin: 1rem 0;
            flex-wrap: wrap;
        }
        
        .btn {
            padding: 0.75rem 1.5rem;
            border: none;
            border-radius: 6px;
            font-size: 1rem;
            cursor: pointer;
            transition: all 0.2s;
            min-width: 120px;
        }
        
        .btn-primary { background: #007bff; color: white; }
        .btn-primary:hover { background: #0056b3; }
        
        .btn-danger { background: #dc3545; color: white; }
        .btn-danger:hover { background: #c82333; }
        
        .btn-secondary { background: #6c757d; color: white; }
        .btn-secondary:hover { background: #5a6268; }
        
        .status {
            margin: 1rem 0;
            padding: 0.75rem;
            border-radius: 6px;
            font-weight: 500;
        }
        
        .status.success { background: #d4edda; color: #155724; border: 1px solid #c3e6cb; }
        .status.error { background: #f8d7da; color: #721c24; border: 1px solid #f5c6cb; }
        .status.info { background: #d1ecf1; color: #0c5460; border: 1px solid #bee5eb; }
        
        .participants {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 1rem;
            margin-top: 2rem;
        }
        
        .participant {
            background: #000;
            border-radius: 8px;
            height: 150px;
            display: flex;
            align-items: center;
            justify-content: center;
            color: white;
            position: relative;
        }
        
        .participant-name {
            position: absolute;
            bottom: 8px;
            left: 8px;
            background: rgba(0,0,0,0.7);
            padding: 0.25rem 0.5rem;
            border-radius: 4px;
            font-size: 0.8rem;
        }
        
        .hidden { display: none; }
        
        @media (max-width: 768px) {
            .controls { flex-direction: column; align-items: center; }
            .btn { width: 200px; }
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>📹 Start Your Stream</h1>
    </div>
    
    <div class="container">
        <div class="stream-box">
            <p>Click "Start Stream" to go live and let others join</p>
            <div class="video-preview" id="videoPreview">
                <div>📹 Ready to stream</div>
            </div>
            
            <div class="controls">
                <button id="startBtn" class="btn btn-primary">Start Stream</button>
                <button id="stopBtn" class="btn btn-danger hidden">Stop Stream</button>
                <button id="muteBtn" class="btn btn-secondary">🎤 Mic</button>
                <button id="videoBtn" class="btn btn-secondary">📷 Camera</button>
            </div>
            
            <div id="status" class="status info">Ready to start streaming</div>
            
            <div id="streamInfo" class="hidden">
                <p><strong>Stream is live!</strong> Others can now join or watch</p>
                <p>Send them to: <strong>/watch</strong></p>
            </div>
        </div>
        
        <div id="participants" class="participants">
            <!-- Guests will appear here -->
        </div>
    </div>

    <script src="/socket.io/socket.io.js"></script>
    <script>
        class StreamHost {
            constructor() {
                this.socket = io();
                this.localStream = null;
                this.isStreaming = false;
                this.isMuted = false;
                this.isVideoEnabled = true;
                this.streamId = 'main-stream'; // Single stream for everyone
                this.participants = new Map();
                this.isGuest = false;
                
                this.checkIfGuest();
                this.initializeEvents();
                this.initializeSocket();
            }
            
            checkIfGuest() {
                const urlParams = new URLSearchParams(window.location.search);
                this.isGuest = urlParams.get('join') === 'true';
                this.updateUI();
            }
            
            updateUI() {
                if (this.isGuest) {
                    // Update UI for guest mode
                    document.querySelector('h1').textContent = '🎤 Join Live Stream';
                    document.getElementById('startBtn').textContent = 'Join Stream';
                    document.querySelector('.stream-box p').textContent = 'Click "Join Stream" to go live with the host';
                } else {
                    // Update UI for host mode
                    document.querySelector('h1').textContent = '📹 Start Your Stream';
                    document.getElementById('startBtn').textContent = 'Start Stream';
                    document.querySelector('.stream-box p').textContent = 'Click "Start Stream" to go live and let others join';
                }
            }
            
            initializeEvents() {
                document.getElementById('startBtn').onclick = () => this.startStream();
                document.getElementById('stopBtn').onclick = () => this.stopStream();
                document.getElementById('muteBtn').onclick = () => this.toggleMute();
                document.getElementById('videoBtn').onclick = () => this.toggleVideo();
            }
            
            initializeSocket() {
                this.socket.on('connect', () => {
                    console.log('✅ Connected to server as:', this.socket.id);
                });
                
                this.socket.on('disconnect', () => {
                    console.log('❌ Disconnected from server');
                });
                
                this.socket.on('error', (error) => {
                    console.error('❌ Socket error:', error);
                });
                
                this.socket.on('guest-joined', (data) => {
                    console.log('🎤 Guest joined:', data.guest);
                    this.addGuest(data.guest);
                    this.updateStatus(data.guest.name + ' joined the stream', 'info');
                });
                
                this.socket.on('guest-left', (data) => {
                    console.log('👋 Guest left:', data.guestId);
                    this.removeGuest(data.guestId);
                    this.updateStatus('Guest left the stream', 'info');
                });
                
                this.socket.on('viewer-joined', (data) => {
                    console.log('👀 Someone started watching:', data.viewerName);
                    this.updateStatus('Someone is now watching', 'info');
                });
                
                this.socket.on('stream-ended', () => {
                    console.log('📺 Stream ended by host');
                    this.updateStatus('Stream ended', 'info');
                    if (this.isGuest) {
                        setTimeout(() => {
                            window.location.href = '/watch';
                        }, 2000);
                    }
                });
            }
            
            async startStream() {
                try {
                    this.updateStatus('Checking stream status...', 'info');
                    
                    // First check if someone is already hosting
                    const streamStatus = await new Promise((resolve) => {
                        this.socket.emit('get-stream-status', (status) => {
                            resolve(status);
                        });
                    });
                    
                    console.log('📊 Current stream status:', streamStatus);
                    
                    // If someone is already hosting and this isn't a forced guest join, become a guest
                    if (streamStatus.isLive && !this.isGuest) {
                        console.log('🎤 Stream already live, joining as guest instead');
                        this.isGuest = true;
                        this.updateUI();
                    }
                    
                    this.updateStatus('Starting camera...', 'info');
                    
                    this.localStream = await navigator.mediaDevices.getUserMedia({
                        video: { width: 640, height: 480 },
                        audio: { echoCancellation: true, noiseSuppression: true }
                    });
                    
                    const preview = document.getElementById('videoPreview');
                    preview.innerHTML = '<video class="video-element" autoplay muted playsinline></video>';
                    preview.querySelector('video').srcObject = this.localStream;
                    
                    if (this.isGuest) {
                        // Join as guest
                        const guestName = 'Guest-' + Math.random().toString(36).substr(2, 6);
                        console.log('🎤 Joining as guest with name:', guestName);
                        this.socket.emit('join-stream-as-guest', {
                            guestName: guestName
                        });
                    } else {
                        // Start hosting the stream
                        const hostName = 'Host-' + Math.random().toString(36).substr(2, 6);
                        console.log('🎥 Starting to host with name:', hostName);
                        this.socket.emit('start-hosting', {
                            hostName: hostName
                        });
                    }
                    
                    this.isStreaming = true;
                    this.toggleControls(true);
                    
                    if (this.isGuest) {
                        this.updateStatus('🎤 You joined the stream!', 'success');
                    } else {
                        this.showStreamInfo();
                        this.updateStatus('🔴 You are live!', 'success');
                    }
                    
                } catch (error) {
                    this.updateStatus('Camera access failed: ' + error.message, 'error');
                }
            }
            
            stopStream() {
                if (this.localStream) {
                    this.localStream.getTracks().forEach(track => track.stop());
                    this.localStream = null;
                }
                
                if (this.isGuest) {
                    this.socket.emit('leave-room');
                } else {
                    this.socket.emit('stop-hosting');
                }
                
                document.getElementById('videoPreview').innerHTML = '<div>Stream ended</div>';
                this.isStreaming = false;
                this.toggleControls(false);
                
                if (this.isGuest) {
                    this.updateStatus('Left the stream', 'info');
                } else {
                    this.hideStreamInfo();
                    this.updateStatus('Stream stopped', 'info');
                }
                
                // Clear all guests
                document.getElementById('participants').innerHTML = '';
                this.participants.clear();
            }
            
            toggleMute() {
                if (!this.localStream) return;
                
                const audioTrack = this.localStream.getAudioTracks()[0];
                if (audioTrack) {
                    audioTrack.enabled = !audioTrack.enabled;
                    this.isMuted = !audioTrack.enabled;
                    
                    const btn = document.getElementById('muteBtn');
                    btn.textContent = this.isMuted ? '🔇 Muted' : '🎤 Mic';
                    btn.style.background = this.isMuted ? '#dc3545' : '#6c757d';
                }
            }
            
            toggleVideo() {
                if (!this.localStream) return;
                
                const videoTrack = this.localStream.getVideoTracks()[0];
                if (videoTrack) {
                    videoTrack.enabled = !videoTrack.enabled;
                    this.isVideoEnabled = videoTrack.enabled;
                    
                    const btn = document.getElementById('videoBtn');
                    btn.textContent = this.isVideoEnabled ? '📷 Camera' : '📷 Off';
                    btn.style.background = this.isVideoEnabled ? '#6c757d' : '#dc3545';
                }
            }
            
            addGuest(guest) {
                const participantsDiv = document.getElementById('participants');
                
                const guestDiv = document.createElement('div');
                guestDiv.className = 'participant';
                guestDiv.id = 'guest-' + guest.id;
                guestDiv.innerHTML = '<div>📹 ' + guest.name + '</div><div class="participant-name">' + guest.name + '</div>';
                
                participantsDiv.appendChild(guestDiv);
                this.participants.set(guest.id, guestDiv);
            }
            
            removeGuest(guestId) {
                const element = this.participants.get(guestId);
                if (element) {
                    element.remove();
                    this.participants.delete(guestId);
                }
            }
            
            showStreamInfo() {
                const streamInfo = document.getElementById('streamInfo');
                streamInfo.classList.remove('hidden');
            }
            
            hideStreamInfo() {
                document.getElementById('streamInfo').classList.add('hidden');
            }
            
            toggleControls(isStreaming) {
                document.getElementById('startBtn').classList.toggle('hidden', isStreaming);
                document.getElementById('stopBtn').classList.toggle('hidden', !isStreaming);
            }
            
            updateStatus(message, type = 'info') {
                const status = document.getElementById('status');
                status.textContent = message;
                status.className = 'status ' + type;
            }
        }
        
        new StreamHost();
    </script>
</body>
</html>`;
  }
} 