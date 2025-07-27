// Watch Client - Handles viewer functionality
class StreamsBrowser {
    constructor() {
        console.log('StreamsBrowser constructor starting...');
        
        try {
            // Check if Socket.IO is available
            if (typeof io === 'undefined') {
                console.error('Socket.IO not loaded! Check if script tag is working.');
                alert('Socket.IO not loaded. Please refresh the page.');
                return;
            }
            
            this.socket = io();
            this.isViewing = false;
            this.participants = new Map();
            this.peerConnections = new Map(); // Store WebRTC connections for viewers
            
            // WebRTC configuration for viewers
            this.rtcConfig = {
                iceServers: [
                    { urls: 'stun:stun.l.google.com:19302' },
                    { urls: 'stun:stun1.l.google.com:19302' }
                ]
            };
            
            this.socket.on('connect', () => {
                console.log('Connected to server');
                this.checkAndJoinStream();
            });
            
            this.socket.on('disconnect', (reason) => {
                console.log('Disconnected from server:', reason);
            });
            
            this.socket.on('stream-ended', () => {
                console.log('Stream ended, going back to browse mode');
                this.showBrowseMode();
            });
            
            // Listen for stream status responses (in case callback doesn't work)
            this.socket.on('stream-status-response', (status) => {
                console.log('Received stream status via event:', status);
                if (status && status.isLive) {
                    this.joinAsViewer(status);
                } else {
                    this.showBrowseMode();
                }
            });
            
            this.socket.on('stream-status-changed', (data) => {
                if (data.isLive) {
                    console.log('Stream went live, auto-joining...');
                    this.checkAndJoinStream();
                } else {
                    console.log('Stream ended, showing browse mode');
                    this.showBrowseMode();
                }
            });
            
            this.socket.on('error', (error) => {
                console.error('Socket error:', error);
            });
            
            // Setup UI events after socket is ready
            this.setupUIEvents();
            
            console.log('StreamsBrowser setup complete');
        } catch (error) {
            console.error('StreamsBrowser constructor error:', error);
        }
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
        
        // Use timeout fallback
        setTimeout(() => {
            if (!responseReceived) {
                console.log('No response from get-stream-status, retrying...');
                this.retryStreamCheck();
            }
        }, 5000);
        
        this.socket.emit('get-stream-status', (status) => {
            responseReceived = true;
            console.log('Received stream status:', status);
            console.log('Status details - isLive:', status?.isLive, 'hostName:', status?.hostName, 'participantCount:', status?.participantCount);
            
            if (status && status.isLive) {
                console.log('Live stream found - auto-joining as viewer');
                this.joinAsViewer(status);
            } else {
                console.log('No live stream - showing browse mode');
                this.showBrowseMode();
            }
        });
    }
    
    retryStreamCheck() {
        console.log('Retrying stream check...');
        // Try without callback first
        this.socket.emit('get-stream-status');
        
        // Then try alternative method
        setTimeout(() => {
            this.socket.emit('join-stream-as-viewer');
        }, 2000);
    }
    
    joinAsViewer(status) {
        this.isViewing = true;
        this.participants = new Map();
        
        // Update only the container content, preserve head/css
        const container = document.querySelector('.container');
        if (container) {
            container.innerHTML = 
                '<h1>Watching Live</h1>' +
                '<div class="live-header">' +
                    '<div class="live-indicator">' +
                        '<div class="live-dot"></div>' +
                        '<span>LIVE</span>' +
                    '</div>' +
                    '<p>Viewing ' + (status.hostName || 'Live Stream') + '</p>' +
                    '<div class="viewer-count" id="participantCount">' + status.participantCount + ' people connected</div>' +
                '</div>' +
                '<div id="liveVideoGrid" class="grid">' +
                    '<div id="loadingMessage" class="video-box">' +
                        '<div style="display: flex; align-items: center; justify-content: center; height: 100%; color: #ccc;">' +
                            'Loading participants...' +
                        '</div>' +
                    '</div>' +
                '</div>' +
                '<div class="controls">' +
                    '<button id="joinStreamBtn" class="btn">Join Stream</button>' +
                    '<button id="refreshBtn" class="btn">Refresh</button>' +
                '</div>';
        }
        
        // Re-setup event listeners after DOM change
        this.setupViewerEventListeners();
        
        // Setup viewer socket events
        this.setupViewerEvents();
        
        // Join as viewer and wait for confirmation
        console.log('Joining as viewer...');
        this.socket.emit('join-stream-as-viewer');
        
        // Request participant list after a short delay
        setTimeout(() => {
            console.log('Requesting fresh participant list...');
            this.socket.emit('get-participants');
        }, 1000);
        
        // Wait longer before requesting video streams to ensure participants are ready
        setTimeout(() => {
            console.log('Starting to request video streams from all participants...');
            this.requestAllVideoStreams();
        }, 3000);
    }
    
    setupViewerEventListeners() {
        // Re-attach event listeners after DOM update
        const joinStreamBtn = document.getElementById('joinStreamBtn');
        if (joinStreamBtn) {
            joinStreamBtn.onclick = () => {
                window.location.href = '/stream';
            };
        }
        
        const refreshBtn = document.getElementById('refreshBtn');
        if (refreshBtn) {
            refreshBtn.onclick = () => {
                this.checkAndJoinStream();
            };
        }
    }
    
    setupViewerEvents() {
        console.log('Setting up viewer events...');
        
        this.socket.on('participants-update', (participants) => {
            console.log('Received participants update:', participants);
            this.displayLiveParticipants(participants);
        });
        
        this.socket.on('participant-joined', (data) => {
            console.log('Participant joined event:', data);
            this.addLiveParticipant(data.participant);
            
            // Request video stream from newly joined participant
            setTimeout(() => {
                console.log('Requesting video stream from newly joined participant:', data.participant.id);
                this.requestVideoStream(data.participant.id);
            }, 2000);
        });
        
        this.socket.on('participant-left', (data) => {
            console.log('Participant left event:', data);
            this.removeLiveParticipant(data.participantId);
        });
        
        this.socket.on('participant-count-update', (count) => {
            console.log('Participant count update:', count);
            const countEl = document.getElementById('participantCount');
            if (countEl) {
                countEl.textContent = count + ' people connected';
            }
        });
        
        // WebRTC Signaling events for viewers
        this.socket.on('webrtc-offer', async (data) => {
            console.log('Viewer received WebRTC offer from:', data.from);
            await this.handleWebRTCOffer(data);
        });
        
        this.socket.on('webrtc-answer', async (data) => {
            console.log('Viewer received WebRTC answer from:', data.from);
            await this.handleWebRTCAnswer(data);
        });
        
        this.socket.on('webrtc-ice-candidate', async (data) => {
            console.log('Viewer received ICE candidate from:', data.from);
            await this.handleICECandidate(data);
        });
        
        // Debug: Listen to ALL events
        this.socket.onAny((event, ...args) => {
            if (event.includes('webrtc') || event.includes('participant') || event.includes('stream')) {
                console.log('Received event:', event, args);
            }
        });
    }
    
    displayLiveParticipants(participants) {
        const grid = document.getElementById('liveVideoGrid');
        if (!grid) {
            console.error('liveVideoGrid not found in DOM!');
            return;
        }
        
        console.log('Displaying participants:', participants);
        
        // Clear loading message
        const loading = document.getElementById('loadingMessage');
        if (loading) loading.remove();
        
        const liveParticipants = participants.filter(p => p.isHost || p.isGuest);
        console.log('Live participants found:', liveParticipants.length);
        
        if (liveParticipants.length === 0) {
            this.participants.clear();
            grid.innerHTML = '<div class="video-box">No one is streaming</div>';
            return;
        }
        
        // Check if this is initial load or an update
        const isInitialLoad = this.participants.size === 0;
        console.log('Is initial load:', isInitialLoad);
        
        if (isInitialLoad) {
            // Initial load - add all participants
            console.log('Initial load - adding all participants');
            grid.innerHTML = ''; // Clear everything
            this.participants.clear();
            
            liveParticipants.forEach(participant => {
                this.addLiveParticipant(participant);
            });
            
            // Request all video streams after adding participants
            setTimeout(() => {
                console.log('Requesting video streams for all participants...');
                this.requestAllVideoStreams();
            }, 2000);
            
        } else {
            // Update - only add new participants, preserve existing ones
            console.log('Update mode - checking for new participants');
            
            const currentParticipantIds = new Set(this.participants.keys());
            const newParticipantIds = new Set(liveParticipants.map(p => p.id));
            
            console.log('Current participants:', Array.from(currentParticipantIds));
            console.log('New participants list:', Array.from(newParticipantIds));
            
            // Remove participants that left
            for (let participantId of currentParticipantIds) {
                if (!newParticipantIds.has(participantId)) {
                    console.log('Removing participant who left:', participantId);
                    this.removeLiveParticipant(participantId);
                }
            }
            
            // Add new participants only
            liveParticipants.forEach(participant => {
                if (!this.participants.has(participant.id)) {
                    console.log('Adding new participant:', participant.id);
                    this.addLiveParticipant(participant);
                    
                    // Request video stream for new participant
                    setTimeout(() => {
                        console.log('Requesting video stream for new participant:', participant.id);
                        this.requestVideoStream(participant.id);
                    }, 1000 + Math.random() * 1000);
                }
            });
        }
    }
    
    addLiveParticipant(participant) {
        const grid = document.getElementById('liveVideoGrid');
        if (!grid) return;
        
        // 🔧 FIX: Prevent duplicates
        if (this.participants.has(participant.id)) {
            console.log('Skipping duplicate participant:', participant.id);
            return;
        }
        
        console.log('Adding participant to grid:', participant);
        
        const videoBox = document.createElement('div');
        videoBox.className = 'video-box';
        videoBox.id = 'viewer-participant-' + participant.id;
        
        const name = participant.hostName || participant.guestName || 'Participant';
        const role = participant.isHost ? 'Host' : 'Guest';
        const icon = participant.isHost ? 'Host' : 'Guest';
        
        // Create content container with improved styling
        const content = document.createElement('div');
        content.style.cssText = 'display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; color: white; text-align: center; gap: 8px;';
        content.innerHTML = 
            '<div style="font-weight: bold;">' + name + '</div>' +
            '<div style="font-size: 0.9rem; opacity: 0.8;">(' + role + ')</div>';
        
        const nameTag = document.createElement('div');
        nameTag.className = 'name-tag';
        nameTag.textContent = icon + ' ' + name;
        
        videoBox.appendChild(content);
        videoBox.appendChild(nameTag);
        grid.appendChild(videoBox);
        this.participants.set(participant.id, videoBox);
        
        console.log('Added participant, grid now has:', this.participants.size, 'participants');
    }
    
    removeLiveParticipant(participantId) {
        console.log('Removing participant:', participantId);
        
        // Remove DOM element
        const element = this.participants.get(participantId);
        if (element) {
            element.remove();
            this.participants.delete(participantId);
            console.log('Removed participant from DOM, grid now has:', this.participants.size, 'participants');
        }
        
        // Close and remove peer connection
        if (this.peerConnections.has(participantId)) {
            console.log('Closing peer connection for:', participantId);
            const peerConnection = this.peerConnections.get(participantId);
            
            // Properly close the connection
            if (peerConnection.connectionState !== 'closed') {
                peerConnection.close();
            }
            
            this.peerConnections.delete(participantId);
            console.log('Removed peer connection, now have:', this.peerConnections.size, 'connections');
        }
        
        // Check if grid is empty
        const grid = document.getElementById('liveVideoGrid');
        if (grid && this.participants.size === 0) {
            grid.innerHTML = '<div class="video-box">Stream ended</div>';
        }
    }
   
    showBrowseMode() {
        this.isViewing = false;
        
        // Reset to browse mode
        const container = document.querySelector('.container');
        if (container) {
            container.innerHTML = 
                '<h1>Live Streams</h1>' +
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

    // Request video streams from all participants
    requestAllVideoStreams() {
        console.log('Requesting video streams from all participants...');
        const grid = document.getElementById('liveVideoGrid');
        if (!grid) {
            console.error('liveVideoGrid not found!');
            return;
        }
        
        const participantElements = grid.querySelectorAll('[id^="viewer-participant-"]');
        console.log('Found ' + participantElements.length + ' participant elements to request streams from');
        
        if (participantElements.length === 0) {
            console.warn('No participant elements found in grid!');
            console.log('Grid content:', grid.innerHTML);
        }
        
        participantElements.forEach(element => {
            const participantId = element.id.replace('viewer-participant-', '');
            console.log('Requesting video stream from participant: ' + participantId);
            
            // Add delay between requests to avoid overwhelming
            setTimeout(() => {
                this.requestVideoStream(participantId);
            }, Math.random() * 1000 + 500); // 500ms-1500ms delay
        });
    }
    
    // WebRTC methods for viewers to receive video streams
    async requestVideoStream(participantId) {
        try {
            console.log('Requesting video stream from participant:', participantId);
            
            // Check if we already have a connection
            if (this.peerConnections.has(participantId)) {
                const existingConnection = this.peerConnections.get(participantId);
                console.log('Already have connection to participant:', participantId, 'State:', existingConnection.connectionState);
                
                // If connection is failed or closed, remove it and create new one
                if (existingConnection.connectionState === 'failed' || existingConnection.connectionState === 'closed') {
                    console.log('Removing failed connection and creating new one for:', participantId);
                    existingConnection.close();
                    this.peerConnections.delete(participantId);
                } else {
                    // Connection exists and is good
                    return;
                }
            }
            
            // Create peer connection for this participant
            const peerConnection = new RTCPeerConnection(this.rtcConfig);
            this.peerConnections.set(participantId, peerConnection);
            
            // Handle connection state changes
            peerConnection.onconnectionstatechange = () => {
                console.log('Connection state with ' + participantId + ':', peerConnection.connectionState);
                if (peerConnection.connectionState === 'failed') {
                    console.error('WebRTC connection failed with:', participantId);
                }
            };
            
            // Handle incoming video stream - CRITICAL FOR VIDEO DISPLAY
            peerConnection.ontrack = (event) => {
                console.log('Received video stream from:', participantId);
                console.log('Stream details:', event.streams[0].getTracks().map(t => ({kind: t.kind, enabled: t.enabled})));
                const remoteStream = event.streams[0];
                
                // Immediately display the video
                this.displayParticipantVideo(participantId, remoteStream);
            };
            
            // Handle ICE candidates
            peerConnection.onicecandidate = (event) => {
                if (event.candidate) {
                    console.log('Sending ICE candidate to participant:', participantId);
                    this.socket.emit('webrtc-ice-candidate', {
                        to: participantId,
                        candidate: event.candidate
                    });
                }
            };
            
            // Create offer to receive video
            const offer = await peerConnection.createOffer({
                offerToReceiveVideo: true,
                offerToReceiveAudio: true
            });
            await peerConnection.setLocalDescription(offer);
            
            console.log('Sending WebRTC offer to participant:', participantId);
            this.socket.emit('webrtc-offer', {
                to: participantId,
                offer: offer
            });
            
        } catch (error) {
            console.error('Error requesting video stream from', participantId, ':', error);
        }
    }
    
    async handleWebRTCOffer(data) {
        try {
            console.log('Handling WebRTC offer for viewer from:', data.from);
            
            const peerConnection = new RTCPeerConnection(this.rtcConfig);
            this.peerConnections.set(data.from, peerConnection);
            
            // Handle incoming video stream
            peerConnection.ontrack = (event) => {
                console.log('Received video stream from:', data.from);
                const remoteStream = event.streams[0];
                this.displayParticipantVideo(data.from, remoteStream);
            };
            
            // Handle ICE candidates
            peerConnection.onicecandidate = (event) => {
                if (event.candidate) {
                    this.socket.emit('webrtc-ice-candidate', {
                        to: data.from,
                        candidate: event.candidate
                    });
                }
            };
            
            // Set remote description and create answer
            await peerConnection.setRemoteDescription(data.offer);
            const answer = await peerConnection.createAnswer();
            await peerConnection.setLocalDescription(answer);
            
            console.log('Sending WebRTC answer to:', data.from);
            this.socket.emit('webrtc-answer', {
                to: data.from,
                answer: answer
            });
            
        } catch (error) {
            console.error('Error handling WebRTC offer for viewer:', error);
        }
    }
    
    async handleWebRTCAnswer(data) {
        try {
            console.log('Handling WebRTC answer for viewer from:', data.from);
            const peerConnection = this.peerConnections.get(data.from);
            
            if (peerConnection) {
                await peerConnection.setRemoteDescription(data.answer);
                console.log('WebRTC connection established with participant:', data.from);
            } else {
                console.error('No peer connection found for:', data.from);
            }
            
        } catch (error) {
            console.error('Error handling WebRTC answer for viewer:', error);
        }
    }
    
    async handleICECandidate(data) {
        try {
            console.log('Handling ICE candidate for viewer from:', data.from);
            const peerConnection = this.peerConnections.get(data.from);
            
            if (peerConnection) {
                await peerConnection.addIceCandidate(data.candidate);
                console.log('ICE candidate added for viewer connection:', data.from);
            } else {
                console.error('No peer connection found for ICE candidate from:', data.from);
            }
            
        } catch (error) {
            console.error('Error handling ICE candidate for viewer:', error);
        }
    }
    
    displayParticipantVideo(participantId, stream) {
        console.log('Displaying participant video for viewer:', participantId);
        
        const participantElement = document.getElementById('viewer-participant-' + participantId);
        if (participantElement) {
            console.log('Found participant element, creating video...');
            
            // Create video element
            const video = document.createElement('video');
            video.autoplay = true;
            video.playsInline = true;
            video.muted = false; // Allow audio for viewers
            video.style.cssText = 'width: 100%; height: 100%; object-fit: cover; border-radius: 8px;';
            video.srcObject = stream;
            
            // Video event handlers
            video.onloadedmetadata = () => {
                console.log('Video metadata loaded for:', participantId);
            };
            
            video.onplaying = () => {
                console.log('Video is playing for:', participantId);
            };
            
            video.onerror = (e) => {
                console.error('Video error for', participantId, ':', e);
            };
            
            // Keep the existing name tag
            const nameTag = participantElement.querySelector('.name-tag');
            
            // Replace content with video
            participantElement.innerHTML = '';
            participantElement.appendChild(video);
            if (nameTag) {
                participantElement.appendChild(nameTag);
            }
            
            // Force video to play (some browsers need this)
            video.play().catch(e => {
                console.warn('Video autoplay failed for', participantId, ':', e.message);
            });
            
            console.log('Real video displayed for viewer for participant:', participantId);
        } else {
            console.error('Participant element not found for video display:', participantId);
            console.log('Available elements:', Array.from(document.querySelectorAll('[id^="viewer-participant-"]')).map(el => el.id));
        }
    }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM ready, creating StreamsBrowser...');
    window.streamsBrowser = new StreamsBrowser();
});

// Also initialize immediately if DOM is already ready
if (document.readyState !== 'loading') {
    console.log('DOM already ready, creating StreamsBrowser...');
    window.streamsBrowser = new StreamsBrowser();
} 