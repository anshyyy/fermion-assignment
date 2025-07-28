// Watch Client - HLS-based viewer functionality for live streaming
class HLSStreamsBrowser {
    constructor() {
        console.log('HLSStreamsBrowser constructor starting...');
        
        try {
            // Check if Socket.IO is available
            if (typeof io === 'undefined') {
                console.error('Socket.IO not loaded! Check if script tag is working.');
                alert('Socket.IO not loaded. Please refresh the page.');
                return;
            }
            
            this.socket = io();
            this.isViewing = false;
            this.hlsPlayer = null;
            this.videoElement = null;
            this.currentStreamInfo = null;
            this.participants = new Map();
            
            // HLS.js configuration
            this.hlsConfig = {
                debug: false,
                enableWorker: false,  // Disable workers to avoid CSP violations
                lowLatencyMode: true,
                backBufferLength: 90,
                maxBufferLength: 30,
                maxMaxBufferLength: 60,
                startLevel: -1, // Auto quality selection
                capLevelToPlayerSize: true,
            };
            
            this.setupSocketEvents();
            this.setupUIEvents();
            
            // Check for live streams on connection
            this.socket.on('connect', () => {
                console.log('Connected to server');
                this.checkAndJoinStream();
            });
            
            console.log('HLSStreamsBrowser setup complete');
        } catch (error) {
            console.error('HLSStreamsBrowser constructor error:', error);
        }
    }
    
    setupSocketEvents() {
        console.log('Setting up socket events...');
        
        this.socket.on('disconnect', (reason) => {
            console.log('Disconnected from server:', reason);
            if (this.hlsPlayer) {
                this.stopHLSPlayback();
            }
        });
        
        // Stream status events
        this.socket.on('stream-status-response', (status) => {
            console.log('Received stream status:', status);
            this.handleStreamStatus(status);
        });
        
        this.socket.on('stream-status-changed', (data) => {
            console.log('Stream status changed:', data);
            if (data.isLive && data.hlsUrl) {
                console.log('Stream went live with HLS, auto-joining...');
                this.checkAndJoinStream();
            } else {
                console.log('Stream ended, showing browse mode');
                this.showBrowseMode();
            }
        });
        
        // HLS stream events
        this.socket.on('hls-stream-ready', async (data) => {
            console.log('HLS stream ready:', data);
            
            // Check if this is a real participant stream or just test pattern
            if (data.streamInfo && data.streamInfo.participantCount > 0) {
                // Real participants - use HLS
                await this.startHLSPlayback(data.playlistUrl, data.streamInfo);
            } else {
                // No real participants - show message and try WebRTC fallback
                console.log('No real participants in HLS stream, trying WebRTC fallback...');
                this.showHLSViewerUI();
                this.showError('Connecting to live participants via WebRTC...');
                
                // Try to connect as WebRTC viewer to see live participants
                setTimeout(() => {
                    this.requestAllVideoStreams();
                }, 2000);
            }
        });
        
        this.socket.on('no-stream-available', (data) => {
            console.log('No stream available:', data);
            this.showBrowseMode();
        });
        
        this.socket.on('stream-ended', () => {
            console.log('Stream ended, going back to browse mode');
            this.stopHLSPlayback();
            this.showBrowseMode();
        });
        
        // Participant events (for UI display)
        this.socket.on('participants-update', (participants) => {
            console.log('Received participants update:', participants);
            this.updateParticipantsList(participants);
        });
        
        this.socket.on('participant-joined', (data) => {
            console.log('Participant joined event:', data);
            this.addParticipantToList(data.participant);
        });
        
        this.socket.on('participant-left', (data) => {
            console.log('Participant left event:', data);
            this.removeParticipantFromList(data.participantId);
        });
        
        this.socket.on('participant-count-update', (count) => {
            console.log('Participant count update:', count);
            this.updateParticipantCount(count);
        });
        
        this.socket.on('error', (error) => {
            console.error('Socket error:', error);
            this.showError('Connection error: ' + error.message);
        });
    }
    
    setupUIEvents() {
        // Refresh button
        const refreshBtn = document.getElementById('refreshBtn');
        if (refreshBtn) {
            refreshBtn.onclick = () => {
                console.log('Refresh button clicked');
                this.checkAndJoinStream();
            };
            console.log('Refresh button listener attached');
        }
    }
    
    checkAndJoinStream() {
        console.log('Checking for live streams...');
        
        // Add timeout to handle cases where callback doesn't work
        let responseReceived = false;
        
        setTimeout(() => {
            if (!responseReceived) {
                console.log('No response from get-stream-status, retrying...');
                this.retryStreamCheck();
            }
        }, 5000);
        
        this.socket.emit('get-stream-status', (status) => {
            responseReceived = true;
            console.log('Received stream status:', status);
            this.handleStreamStatus(status);
        });
    }
    
    handleStreamStatus(status) {
        console.log('Handling stream status:', status);
        
        if (status && status.isLive && status.hlsAvailable) {
            console.log('Live HLS stream found - joining as viewer');
            this.joinAsHLSViewer(status);
        } else if (status && status.isLive && !status.hlsAvailable) {
            console.log('Live stream found but HLS not ready yet - will retry');
            setTimeout(() => this.checkAndJoinStream(), 2000);
        } else {
            console.log('No live stream - showing browse mode');
            this.showBrowseMode();
        }
    }
    
    retryStreamCheck() {
        console.log('Retrying stream check...');
        this.socket.emit('get-stream-status');
        
        setTimeout(() => {
            this.socket.emit('join-stream-as-viewer');
        }, 2000);
    }
    
    joinAsHLSViewer(status) {
        console.log('Joining as HLS viewer with status:', status);
        
        this.isViewing = true;
        this.currentStreamInfo = status.streamInfo;
        this.participants = new Map();
        
        // Update UI for HLS viewing
        this.showHLSViewerUI(status);
        
        // Join as viewer via socket
        this.socket.emit('join-stream-as-viewer');
        
        // HLS stream will be started when we receive 'hls-stream-ready' event
    }
    
    showHLSViewerUI(status) {
        const container = document.querySelector('.container');
        if (container) {
            container.innerHTML = 
                '<h1>📺 Live Stream</h1>' +
                '<div class="live-header">' +
                    '<div class="live-indicator">' +
                        '<div class="live-dot"></div>' +
                        '<span>LIVE</span>' +
                    '</div>' +
                    '<p>Watching ' + (status.hostName || 'Live Stream') + '</p>' +
                    '<div class="viewer-count" id="participantCount">' + 
                        status.participantCount + ' people connected' +
                    '</div>' +
                '</div>' +
                '<div class="video-container">' +
                    '<video id="hlsVideo" controls autoplay muted playsinline>' +
                        'Your browser does not support the video tag.' +
                    '</video>' +
                    '<div id="loadingOverlay" class="loading-overlay">' +
                        '<div class="loading-spinner"></div>' +
                        '<p>Loading stream...</p>' +
                    '</div>' +
                    '<div id="errorOverlay" class="error-overlay" style="display: none;">' +
                        '<div class="error-message">' +
                            '<h3>🔴 Stream Error</h3>' +
                            '<p id="errorText">Unable to load stream</p>' +
                            '<button id="retryBtn" class="btn">Retry</button>' +
                        '</div>' +
                    '</div>' +
                '</div>' +
                '<div class="stream-info">' +
                    '<div class="participants-list">' +
                        '<h3>👥 Participants</h3>' +
                        '<div id="participantsList"></div>' +
                    '</div>' +
                    '<div class="stream-stats" id="streamStats">' +
                        '<h3>📊 Stream Info</h3>' +
                        '<div class="stat-item"><span>Quality:</span> <span id="qualityInfo">Auto</span></div>' +
                        '<div class="stat-item"><span>Latency:</span> <span id="latencyInfo">-</span></div>' +
                        '<div class="stat-item"><span>Buffer:</span> <span id="bufferInfo">-</span></div>' +
                    '</div>' +
                '</div>' +
                '<div class="controls">' +
                    '<button id="joinStreamBtn" class="btn">Join Stream</button>' +
                    '<button id="refreshBtn" class="btn">Refresh</button>' +
                    '<button id="fullscreenBtn" class="btn">Fullscreen</button>' +
                '</div>';
        }
        
        // Re-setup event listeners
        this.setupViewerEventListeners();
        
        // Get video element reference
        this.videoElement = document.getElementById('hlsVideo');
        
        // Add CSS for video container and overlays
        this.addViewerStyles();
    }
    
    addViewerStyles() {
        // Add styles if not already present
        if (!document.getElementById('hls-viewer-styles')) {
            const style = document.createElement('style');
            style.id = 'hls-viewer-styles';
            style.textContent = `
                .video-container {
                    position: relative;
                    width: 100%;
                    max-width: 1280px;
                    margin: 20px auto;
                    background: #000;
                    border-radius: 8px;
                    overflow: hidden;
                }
                
                #hlsVideo {
                    width: 100%;
                    height: auto;
                    min-height: 400px;
                    background: #000;
                }
                
                .loading-overlay, .error-overlay {
                    position: absolute;
                    top: 0;
                    left: 0;
                    right: 0;
                    bottom: 0;
                    background: rgba(0, 0, 0, 0.8);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    color: white;
                    text-align: center;
                }
                
                .loading-spinner {
                    width: 50px;
                    height: 50px;
                    border: 3px solid #333;
                    border-top: 3px solid #007bff;
                    border-radius: 50%;
                    animation: spin 1s linear infinite;
                    margin-bottom: 15px;
                }
                
                @keyframes spin {
                    0% { transform: rotate(0deg); }
                    100% { transform: rotate(360deg); }
                }
                
                .stream-info {
                    display: flex;
                    gap: 20px;
                    margin: 20px 0;
                    flex-wrap: wrap;
                }
                
                .participants-list, .stream-stats {
                    flex: 1;
                    min-width: 300px;
                    background: #f8f9fa;
                    padding: 15px;
                    border-radius: 8px;
                }
                
                .participants-list h3, .stream-stats h3 {
                    margin-top: 0;
                    color: #333;
                }
                
                .participant-item {
                    padding: 8px 12px;
                    margin: 5px 0;
                    background: white;
                    border-radius: 6px;
                    border-left: 4px solid #007bff;
                }
                
                .participant-item.host {
                    border-left-color: #28a745;
                }
                
                .participant-item.guest {
                    border-left-color: #ffc107;
                }
                
                .stat-item {
                    display: flex;
                    justify-content: space-between;
                    padding: 5px 0;
                    border-bottom: 1px solid #dee2e6;
                }
                
                .live-dot {
                    width: 12px;
                    height: 12px;
                    background: #dc3545;
                    border-radius: 50%;
                    display: inline-block;
                    margin-right: 8px;
                    animation: pulse 2s infinite;
                }
                
                @keyframes pulse {
                    0% { opacity: 1; }
                    50% { opacity: 0.5; }
                    100% { opacity: 1; }
                }
            `;
            document.head.appendChild(style);
        }
    }
    
    setupViewerEventListeners() {
        // Join stream button
        const joinStreamBtn = document.getElementById('joinStreamBtn');
        if (joinStreamBtn) {
            joinStreamBtn.onclick = () => {
                window.location.href = '/stream';
            };
        }
        
        // Refresh button
        const refreshBtn = document.getElementById('refreshBtn');
        if (refreshBtn) {
            refreshBtn.onclick = () => {
                this.checkAndJoinStream();
            };
        }
        
        // Fullscreen button
        const fullscreenBtn = document.getElementById('fullscreenBtn');
        if (fullscreenBtn) {
            fullscreenBtn.onclick = () => {
                this.toggleFullscreen();
            };
        }
        
        // Retry button
        const retryBtn = document.getElementById('retryBtn');
        if (retryBtn) {
            retryBtn.onclick = () => {
                this.retryHLSPlayback();
            };
        }
    }
    
    async startHLSPlayback(playlistUrl, streamInfo) {
        console.log('Starting HLS playback:', playlistUrl);
        console.log('Video element:', this.videoElement);
        console.log('HLS.js available:', typeof Hls !== 'undefined');
        console.log('HLS.js supported:', typeof Hls !== 'undefined' ? Hls.isSupported() : 'N/A');
        
        try {
            if (!this.videoElement) {
                throw new Error('Video element not found');
            }
            
            // Hide loading overlay temporarily
            this.hideOverlays();
            
            // Check if HLS.js is available and supported
            if (typeof Hls !== 'undefined' && Hls.isSupported()) {
                console.log('HLS.js is available and supported, initializing...');
                
                this.hlsPlayer = new Hls(this.hlsConfig);
                
                // Setup HLS.js event listeners
                this.setupHLSEventListeners();
                
                // Load the source
                this.hlsPlayer.loadSource(playlistUrl);
                this.hlsPlayer.attachMedia(this.videoElement);
                
                console.log('HLS.js initialized and source loaded');
                
            } else if (this.videoElement.canPlayType('application/vnd.apple.mpegurl')) {
                // Safari native HLS support
                console.log('Using native HLS support (Safari)');
                this.videoElement.src = playlistUrl;
                
                this.videoElement.addEventListener('loadedmetadata', () => {
                    console.log('Native HLS loaded');
                    this.hideOverlays();
                    this.updateStreamStats();
                });
                
                this.videoElement.addEventListener('error', (e) => {
                    console.error('Native HLS error:', e);
                    this.showError('Stream playback error');
                });
                
            } else {
                let errorMsg = 'HLS playback not available. ';
                if (typeof Hls === 'undefined') {
                    errorMsg += 'HLS.js library failed to load. ';
                }
                errorMsg += 'Your browser may not support HLS streaming.';
                throw new Error(errorMsg);
            }
            
            // Update stream info
            this.currentStreamInfo = streamInfo;
            this.updateStreamStats();
            
        } catch (error) {
            console.error('Error starting HLS playback:', error);
            this.showError('Failed to start video playback: ' + error.message);
        }
    }
    
    setupHLSEventListeners() {
        if (!this.hlsPlayer) return;
        
        this.hlsPlayer.on(Hls.Events.MANIFEST_PARSED, () => {
            console.log('✅ HLS manifest parsed successfully, starting playback');
            this.hideOverlays();
            this.videoElement.play().catch(e => {
                console.warn('Autoplay failed, user interaction required:', e);
                this.showError('Autoplay blocked. Please click the video to start playback.');
            });
        });
        
        this.hlsPlayer.on(Hls.Events.LEVEL_SWITCHED, (event, data) => {
            console.log('Quality level switched to:', data.level);
            this.updateQualityInfo(data.level);
        });
        
        this.hlsPlayer.on(Hls.Events.ERROR, (event, data) => {
            console.error('HLS.js error:', data);
            
            if (data.fatal) {
                switch (data.type) {
                    case Hls.ErrorTypes.NETWORK_ERROR:
                        console.error('Fatal network error encountered, trying to recover');
                        this.hlsPlayer.startLoad();
                        break;
                    case Hls.ErrorTypes.MEDIA_ERROR:
                        console.error('Fatal media error encountered, trying to recover');
                        this.hlsPlayer.recoverMediaError();
                        break;
                    default:
                        console.error('Fatal error, destroying HLS instance');
                        this.showError('Stream playback failed');
                        break;
                }
            }
        });
        
        this.hlsPlayer.on(Hls.Events.FRAG_BUFFERED, () => {
            this.updateBufferInfo();
        });
    }
    
    stopHLSPlayback() {
        console.log('Stopping HLS playback');
        
        if (this.hlsPlayer) {
            this.hlsPlayer.destroy();
            this.hlsPlayer = null;
        }
        
        if (this.videoElement) {
            this.videoElement.src = '';
            this.videoElement.load();
        }
        
        this.currentStreamInfo = null;
    }
    
    retryHLSPlayback() {
        console.log('Retrying HLS playback');
        this.stopHLSPlayback();
        this.checkAndJoinStream();
    }
    
    showBrowseMode() {
        this.isViewing = false;
        this.stopHLSPlayback();
        
        // Reset to browse mode
        const container = document.querySelector('.container');
        if (container) {
            container.innerHTML = 
                '<h1>📺 Live Streams</h1>' +
                '<div id="streamsList">' +
                    '<div class="empty-state" id="emptyState">' +
                        '<h2>No live streams</h2>' +
                        '<p>No one is streaming right now</p>' +
                        '<br>' +
                        '<a href="/stream" class="btn">Start Your Stream</a>' +
                    '</div>' +
                '</div>' +
                '<div class="controls">' +
                    '<button id="refreshBtn" class="btn">Refresh</button>' +
                '</div>';
        }
        
        // Re-setup UI events
        this.setupUIEvents();
    }
    
    updateParticipantsList(participants) {
        const participantsList = document.getElementById('participantsList');
        if (!participantsList) return;
        
        console.log('Updating participants list:', participants);
        
        participantsList.innerHTML = '';
        
        if (participants.length === 0) {
            participantsList.innerHTML = '<p style="color: #666;">No participants</p>';
            return;
        }
        
        participants.forEach(participant => {
            this.addParticipantToList(participant);
        });
    }
    
    addParticipantToList(participant) {
        const participantsList = document.getElementById('participantsList');
        if (!participantsList) return;
        
        const name = participant.hostName || participant.guestName || 'Participant';
        const role = participant.isHost ? 'host' : 'guest';
        const icon = participant.isHost ? '👑' : '🎤';
        
        const participantDiv = document.createElement('div');
        participantDiv.className = `participant-item ${role}`;
        participantDiv.id = `participant-list-${participant.id}`;
        participantDiv.innerHTML = `${icon} ${name}`;
        
        participantsList.appendChild(participantDiv);
        this.participants.set(participant.id, participantDiv);
    }
    
    removeParticipantFromList(participantId) {
        const element = this.participants.get(participantId);
        if (element) {
            element.remove();
            this.participants.delete(participantId);
        }
    }
    
    updateParticipantCount(count) {
        const countEl = document.getElementById('participantCount');
        if (countEl) {
            countEl.textContent = count + ' people connected';
        }
    }
    
    updateStreamStats() {
        if (!this.currentStreamInfo) return;
        
        // Update quality info
        this.updateQualityInfo();
        
        // Update buffer info
        this.updateBufferInfo();
        
        // Update latency info (simplified)
        const latencyEl = document.getElementById('latencyInfo');
        if (latencyEl) {
            latencyEl.textContent = '~3-5s';
        }
    }
    
    updateQualityInfo(level = null) {
        const qualityEl = document.getElementById('qualityInfo');
        if (!qualityEl) return;
        
        if (this.hlsPlayer && level !== null) {
            const levels = this.hlsPlayer.levels;
            if (levels && levels[level]) {
                const resolution = `${levels[level].width}x${levels[level].height}`;
                qualityEl.textContent = resolution;
            }
        } else {
            qualityEl.textContent = 'Auto';
        }
    }
    
    updateBufferInfo() {
        const bufferEl = document.getElementById('bufferInfo');
        if (!bufferEl || !this.videoElement) return;
        
        try {
            const buffered = this.videoElement.buffered;
            if (buffered.length > 0) {
                const bufferEnd = buffered.end(buffered.length - 1);
                const currentTime = this.videoElement.currentTime;
                const bufferLength = Math.max(0, bufferEnd - currentTime);
                bufferEl.textContent = `${bufferLength.toFixed(1)}s`;
            } else {
                bufferEl.textContent = '0s';
            }
        } catch (error) {
            bufferEl.textContent = '-';
        }
    }
    
    toggleFullscreen() {
        if (!this.videoElement) return;
        
        if (this.videoElement.requestFullscreen) {
            this.videoElement.requestFullscreen();
        } else if (this.videoElement.webkitRequestFullscreen) {
            this.videoElement.webkitRequestFullscreen();
        } else if (this.videoElement.mozRequestFullScreen) {
            this.videoElement.mozRequestFullScreen();
        }
    }
    
    hideOverlays() {
        const loadingOverlay = document.getElementById('loadingOverlay');
        const errorOverlay = document.getElementById('errorOverlay');
        
        if (loadingOverlay) loadingOverlay.style.display = 'none';
        if (errorOverlay) errorOverlay.style.display = 'none';
    }
    
    showError(message) {
        const errorOverlay = document.getElementById('errorOverlay');
        const errorText = document.getElementById('errorText');
        const loadingOverlay = document.getElementById('loadingOverlay');
        
        if (loadingOverlay) loadingOverlay.style.display = 'none';
        
        if (errorText) errorText.textContent = message;
        if (errorOverlay) errorOverlay.style.display = 'flex';
        
        console.error('Showing error to user:', message);
    }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM ready, creating HLSStreamsBrowser...');
    window.hlsStreamsBrowser = new HLSStreamsBrowser();
});

// Also initialize immediately if DOM is already ready
if (document.readyState !== 'loading') {
    console.log('DOM already ready, creating HLSStreamsBrowser...');
    window.hlsStreamsBrowser = new HLSStreamsBrowser();
} 