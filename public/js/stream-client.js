// Stream Client - Handles host and guest functionality
class StreamHost {
    constructor() {
        console.log('🚀 StreamHost constructor starting...');
        
        try {
            // Check if Socket.IO is available
            if (typeof io === 'undefined') {
                console.error('❌ Socket.IO not loaded! Check if script tag is working.');
                alert('Socket.IO not loaded. Please refresh the page.');
                return;
            }
            
            this.socket = io();
            this.localStream = null;
            this.isStreaming = false;
            this.isMuted = false;
            this.isVideoEnabled = true;
            this.streamId = 'main-stream';
            this.participants = new Map();
            this.peerConnections = new Map(); // Store WebRTC connections
            this.isGuest = false;
            
            // WebRTC configuration
            this.rtcConfig = {
                iceServers: [
                    { urls: 'stun:stun.l.google.com:19302' },
                    { urls: 'stun:stun1.l.google.com:19302' }
                ]
            };
            
            console.log('📋 StreamHost initialized, setting up...');
            
            this.checkIfGuest();
            this.initializeEvents();
            this.initializeSocket();
            
            console.log('✅ StreamHost setup complete');
        } catch (error) {
            console.error('❌ StreamHost constructor error:', error);
        }
    }
    
    checkIfGuest() {
        const urlParams = new URLSearchParams(window.location.search);
        this.isGuest = urlParams.get('join') === 'true';
        this.updateUI();
    }
    
    updateUI() {
        console.log('🎨 Updating UI, isGuest:', this.isGuest);
        
        try {
            const h1 = document.querySelector('h1');
            const startBtn = document.getElementById('startBtn');
            const p = document.querySelector('p');
            
            if (this.isGuest) {
                // Update UI for guest mode
                if (h1) h1.textContent = '🎤 Join Live Stream';
                if (startBtn) startBtn.textContent = 'Join Stream';
                if (p) p.textContent = 'Click "Join Stream" to go live with the host';
                console.log('✅ UI updated for guest mode');
            } else {
                // Update UI for host mode
                if (h1) h1.textContent = '📹 Start Your Stream';
                if (startBtn) startBtn.textContent = 'Start Stream';
                if (p) p.textContent = 'Click "Start Stream" to go live and let others join';
                console.log('✅ UI updated for host mode');
            }
        } catch (error) {
            console.error('❌ Error updating UI:', error);
        }
    }
    
    initializeEvents() {
        console.log('🔧 Setting up event listeners...');
        
        try {
            const startBtn = document.getElementById('startBtn');
            const stopBtn = document.getElementById('stopBtn');
            const muteBtn = document.getElementById('muteBtn');
            const videoBtn = document.getElementById('videoBtn');
            const testRemoveBtn = document.getElementById('testRemoveBtn');
            
            if (startBtn) {
                startBtn.onclick = () => {
                    console.log('▶️ Start button clicked');
                    this.startStream();
                };
                console.log('✅ Start button listener attached');
            }
            
            if (stopBtn) {
                stopBtn.onclick = () => {
                    console.log('⏹️ Stop button clicked');
                    this.stopStream();
                };
            }
            
            if (muteBtn) {
                muteBtn.onclick = () => {
                    console.log('🎤 Mute button clicked');
                    this.toggleMute();
                };
            }
            
            if (videoBtn) {
                videoBtn.onclick = () => {
                    console.log('📷 Video button clicked');
                    this.toggleVideo();
                };
            }
            
            if (testRemoveBtn) {
                testRemoveBtn.onclick = () => {
                    console.log('🧪 Test remove button clicked');
                    this.testRemoveParticipant();
                };
            }
            
            console.log('✅ Event listeners setup complete');
            
        } catch (error) {
            console.error('❌ Error setting up events:', error);
        }
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
            console.log('👋 Guest left event received:', data);
            if (data.guestId) {
                this.removeGuest(data.guestId);
                this.updateStatus('Guest left the stream', 'info');
            }
        });
        
        this.socket.on('participant-left', (data) => {
            console.log('👋 Participant left event received:', data);
            if (data.participantId) {
                this.removeGuest(data.participantId);
                this.updateStatus('Participant left the stream', 'info');
            }
        });
        
        this.socket.on('viewer-joined', (data) => {
            console.log('👀 Viewer joined, they will request our stream:', data.viewerName);
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
        
        // For guests: Show host and other participants
        this.socket.on('participants-list', (participants) => {
            console.log('📋 Received participants list for guest:', participants);
            if (this.isGuest) {
                this.showOtherParticipants(participants);
            }
        });
        
        // WebRTC Signaling events
        this.socket.on('webrtc-offer', async (data) => {
            console.log('📞 Received WebRTC offer from:', data.from);
            await this.handleWebRTCOffer(data);
        });
        
        this.socket.on('webrtc-answer', async (data) => {
            console.log('📞 Received WebRTC answer from:', data.from);
            await this.handleWebRTCAnswer(data);
        });
        
        this.socket.on('webrtc-ice-candidate', async (data) => {
            console.log('🧊 Received ICE candidate from:', data.from);
            await this.handleICECandidate(data);
        });
        
        this.socket.on('participant-joined', async (data) => {
            console.log('🔗 New participant joined, initiating WebRTC:', data.participant);
            if (this.localStream && data.participant.id !== this.socket.id) {
                await this.initiateWebRTCConnection(data.participant.id);
            }
        });
        
        // Listen to ALL socket events for debugging
        this.socket.onAny((event, ...args) => {
            if (event.includes('left') || event.includes('disconnect') || event.includes('leave')) {
                console.log('🔔 Received event:', event, args);
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
                
                // Update the preview label for guest
                const preview = document.getElementById('videoPreview');
                if (preview.querySelector('.participant-name')) {
                    preview.querySelector('.participant-name').textContent = '👤 You (Guest)';
                }
            }
            
            this.updateStatus('Starting camera...', 'info');
            
            this.localStream = await navigator.mediaDevices.getUserMedia({
                video: { width: 640, height: 480 },
                audio: { echoCancellation: true, noiseSuppression: true }
            });
            
            const preview = document.getElementById('videoPreview');
            preview.innerHTML = '<video class="video-element" autoplay muted playsinline></video><div class="participant-name">👤 You (Host)</div>';
            preview.querySelector('video').srcObject = this.localStream;
            
            if (this.isGuest) {
                // Join as guest
                const guestName = 'Guest-' + Math.random().toString(36).substr(2, 6);
                console.log('🎤 Joining as guest with name:', guestName);
                this.socket.emit('join-stream-as-guest', {
                    guestName: guestName
                });
                
                // Request to see the host and other participants
                setTimeout(() => {
                    this.socket.emit('get-participants');
                }, 1000);
                
                // Initiate WebRTC connections with existing participants  
                setTimeout(() => {
                    this.socket.emit('request-peer-connections');
                }, 2000);
                
                // Also listen for viewer requests (guests need to respond to viewers)
                setTimeout(() => {
                    console.log('🎤 Guest ready to send video to viewers');
                }, 3000);
                
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
        
        // Close all peer connections
        this.peerConnections.forEach((pc, socketId) => {
            console.log('🔌 Closing peer connection to:', socketId);
            pc.close();
        });
        this.peerConnections.clear();
        
        if (this.isGuest) {
            this.socket.emit('leave-room');
        } else {
            this.socket.emit('stop-hosting');
        }
        
        // Reset video preview
        const preview = document.getElementById('videoPreview');
        preview.innerHTML = '<div style="display: flex; align-items: center; justify-content: center; height: 100%; color: #ccc;">📹 Ready to stream</div>';
        
        this.isStreaming = false;
        this.toggleControls(false);
        
        if (this.isGuest) {
            this.updateStatus('Left the stream', 'info');
        } else {
            this.hideStreamInfo();
            this.updateStatus('Stream stopped', 'info');
        }
        
        // Clear all guests from unified grid (keep only host preview)
        const videoGrid = document.getElementById('videoGrid');
        const guestElements = videoGrid.querySelectorAll('.participant');
        guestElements.forEach(element => element.remove());
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
        console.log('➕ Adding guest to unified grid:', guest);
        const videoGrid = document.getElementById('videoGrid');
        
        const guestDiv = document.createElement('div');
        guestDiv.className = 'participant';
        guestDiv.id = 'guest-' + guest.id;
        
        // Create placeholder until real video stream
        const placeholder = document.createElement('div');
        placeholder.style.cssText = 'width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; flex-direction: column; color: white;';
        placeholder.innerHTML = '<div style="font-size: 2rem;">📹</div><div>' + guest.name + '</div><div>Connecting...</div>';
        
        const nameTag = document.createElement('div');
        nameTag.className = 'participant-name';
        nameTag.textContent = '🎤 ' + guest.name;
        
        guestDiv.appendChild(placeholder);
        guestDiv.appendChild(nameTag);
        videoGrid.appendChild(guestDiv);
        this.participants.set(guest.id, guestDiv);
        
        console.log('✅ Guest added to unified grid, total guests:', this.participants.size);
        
        // Simulate receiving guest video after a short delay
        setTimeout(() => {
            placeholder.innerHTML = '<div style="font-size: 2rem;">📹</div><div>' + guest.name + '</div><div style="color: #28a745; font-weight: bold;">🔴 Live</div>';
            placeholder.style.background = 'linear-gradient(45deg, #28a745, #20c997)';
        }, 2000);
    }
    
    removeGuest(guestId) {
        console.log('➖ Attempting to remove guest from unified grid:', guestId);
        console.log('🔍 Current participants in map:', Array.from(this.participants.keys()));
        
        // Try multiple ways to find the element
        let guestElement = null;
        
        // Method 1: Direct ID lookup
        guestElement = document.getElementById('guest-' + guestId);
        if (!guestElement) {
            guestElement = document.getElementById('participant-' + guestId);
        }
        
        // Method 2: Check what's in the grid
        if (!guestElement) {
            const videoGrid = document.getElementById('videoGrid');
            const allParticipants = videoGrid.querySelectorAll('.participant');
            console.log('🔍 All participant elements in grid:', Array.from(allParticipants).map(el => el.id));
            
            // Try to find by any matching ID
            allParticipants.forEach(element => {
                if (element.id.includes(guestId)) {
                    guestElement = element;
                    console.log('🎯 Found element by partial match:', element.id);
                }
            });
        }
        
        // Method 3: Use participants map
        if (!guestElement && this.participants.has(guestId)) {
            guestElement = this.participants.get(guestId);
            console.log('🎯 Found element from participants map');
        }
        
        if (guestElement) {
            console.log('🗑️ Found guest element, removing from grid:', guestElement.id);
            guestElement.remove();
            this.participants.delete(guestId);
            console.log('✅ Guest removed from unified grid, remaining guests:', this.participants.size);
            
            // Force grid update
            const videoGrid = document.getElementById('videoGrid');
            console.log('📊 Grid elements after removal:', videoGrid.children.length);
        } else {
            console.error('❌ Guest element not found for removal! ID:', guestId);
            console.log('🔍 Available elements:');
            const videoGrid = document.getElementById('videoGrid');
            Array.from(videoGrid.children).forEach(child => {
                console.log('  - Element ID:', child.id, 'Class:', child.className);
            });
        }
        
        // Also remove any peer connection
        if (this.peerConnections.has(guestId)) {
            console.log('🔌 Closing peer connection for leaving guest:', guestId);
            this.peerConnections.get(guestId).close();
            this.peerConnections.delete(guestId);
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
    
    // WebRTC Connection Management
    async initiateWebRTCConnection(remoteSocketId) {
        try {
            console.log('🔗 Initiating WebRTC connection to:', remoteSocketId);
            
            // Create peer connection
            const peerConnection = new RTCPeerConnection(this.rtcConfig);
            this.peerConnections.set(remoteSocketId, peerConnection);
            
            // Add local stream to peer connection
            if (this.localStream) {
                this.localStream.getTracks().forEach(track => {
                    peerConnection.addTrack(track, this.localStream);
                    console.log('➕ Added local track:', track.kind);
                });
            }
            
            // Handle remote stream
            peerConnection.ontrack = (event) => {
                console.log('📹 Received remote stream from:', remoteSocketId);
                const remoteStream = event.streams[0];
                this.displayRemoteVideo(remoteSocketId, remoteStream);
            };
            
            // Handle ICE candidates
            peerConnection.onicecandidate = (event) => {
                if (event.candidate) {
                    console.log('🧊 Sending ICE candidate to:', remoteSocketId);
                    this.socket.emit('webrtc-ice-candidate', {
                        to: remoteSocketId,
                        candidate: event.candidate
                    });
                }
            };
            
            // Create offer
            const offer = await peerConnection.createOffer();
            await peerConnection.setLocalDescription(offer);
            
            console.log('📤 Sending WebRTC offer to:', remoteSocketId);
            this.socket.emit('webrtc-offer', {
                to: remoteSocketId,
                offer: offer
            });
            
        } catch (error) {
            console.error('❌ Error initiating WebRTC connection:', error);
        }
    }
    
    async handleWebRTCOffer(data) {
        try {
            console.log('📥 Handling WebRTC offer from:', data.from);
            
            // Create peer connection
            const peerConnection = new RTCPeerConnection(this.rtcConfig);
            this.peerConnections.set(data.from, peerConnection);
            
            // Always add local stream to send our video to the requester
            if (this.localStream) {
                this.localStream.getTracks().forEach(track => {
                    peerConnection.addTrack(track, this.localStream);
                    console.log('➕ Added local track to send to requester:', track.kind);
                });
            } else {
                console.warn('⚠️ No local stream available to send to:', data.from);
            }
            
            // Handle remote stream (if any - viewers won't send video back)
            peerConnection.ontrack = (event) => {
                console.log('📹 Received remote stream from:', data.from);
                const remoteStream = event.streams[0];
                this.displayRemoteVideo(data.from, remoteStream);
            };
            
            // Handle ICE candidates
            peerConnection.onicecandidate = (event) => {
                if (event.candidate) {
                    console.log('🧊 Sending ICE candidate to:', data.from);
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
            
            console.log('📤 Sending WebRTC answer to (will include our video):', data.from);
            this.socket.emit('webrtc-answer', {
                to: data.from,
                answer: answer
            });
            
        } catch (error) {
            console.error('❌ Error handling WebRTC offer:', error);
        }
    }
    
    async handleWebRTCAnswer(data) {
        try {
            console.log('📥 Handling WebRTC answer from:', data.from);
            const peerConnection = this.peerConnections.get(data.from);
            
            if (peerConnection) {
                await peerConnection.setRemoteDescription(data.answer);
                console.log('✅ WebRTC connection established with:', data.from);
            }
            
        } catch (error) {
            console.error('❌ Error handling WebRTC answer:', error);
        }
    }
    
    async handleICECandidate(data) {
        try {
            console.log('🧊 Handling ICE candidate from:', data.from);
            const peerConnection = this.peerConnections.get(data.from);
            
            if (peerConnection) {
                await peerConnection.addIceCandidate(data.candidate);
                console.log('✅ ICE candidate added for:', data.from);
            }
            
        } catch (error) {
            console.error('❌ Error handling ICE candidate:', error);
        }
    }
    
    displayRemoteVideo(socketId, stream) {
        console.log('🖥️ Displaying remote video in unified grid for:', socketId);
        
        // Find existing participant container in the unified grid
        let participantElement = document.getElementById('participant-' + socketId) || 
                               document.getElementById('guest-' + socketId);
        
        if (!participantElement) {
            // Create new participant container in the unified grid
            const videoGrid = document.getElementById('videoGrid');
            participantElement = document.createElement('div');
            participantElement.className = 'participant';
            participantElement.id = 'participant-' + socketId;
            videoGrid.appendChild(participantElement);
        }
        
        // Create video element with proper styling
        const video = document.createElement('video');
        video.autoplay = true;
        video.playsInline = true;
        video.muted = false; // Don't mute remote participants
        video.srcObject = stream;
        
        // Create name tag
        const nameTag = document.createElement('div');
        nameTag.className = 'participant-name';
        nameTag.textContent = '🔴 Live Guest';
        
        // Clear existing content and add video
        participantElement.innerHTML = '';
        participantElement.appendChild(video);
        participantElement.appendChild(nameTag);
        
        console.log('✅ Remote video displayed in unified grid for:', socketId);
    }
    
    showOtherParticipants(participants) {
        console.log('👥 Showing other participants for guest in unified grid:', participants);
        const videoGrid = document.getElementById('videoGrid');
        
        // Clear existing participants (except own video preview)
        const existingParticipants = videoGrid.querySelectorAll('.participant');
        existingParticipants.forEach(element => element.remove());
        this.participants.clear();
        
        participants.forEach(participant => {
            if (participant.id !== this.socket.id) { // Don't show self
                console.log('➕ Adding participant to guest unified grid:', participant);
                
                const participantDiv = document.createElement('div');
                participantDiv.className = 'participant';
                participantDiv.id = 'participant-' + participant.id;
                
                const isHost = participant.role === 'host' || participant.isHost;
                const name = participant.hostName || participant.guestName || participant.displayName || 'Participant';
                const role = isHost ? 'Host' : 'Guest';
                const icon = isHost ? '🎥' : '🎤';
                
                // Create video placeholder
                const placeholder = document.createElement('div');
                placeholder.style.cssText = 'width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; flex-direction: column; color: white; background: linear-gradient(45deg, #667eea, #764ba2);';
                placeholder.innerHTML = '<div style="font-size: 2rem;">' + icon + '</div><div>' + name + '</div><div>(' + role + ')</div>';
                
                const nameTag = document.createElement('div');
                nameTag.className = 'participant-name';
                nameTag.textContent = icon + ' ' + name;
                
                participantDiv.appendChild(placeholder);
                participantDiv.appendChild(nameTag);
                videoGrid.appendChild(participantDiv);
                this.participants.set(participant.id, participantDiv);
                
                console.log('✅ Added participant to unified grid:', name, 'Role:', role);
            }
        });
        
        console.log('✅ Total participants shown to guest in unified grid:', this.participants.size);
    }
    
    // Test method to manually remove a participant
    testRemoveParticipant() {
        console.log('🧪 Testing participant removal...');
        const videoGrid = document.getElementById('videoGrid');
        const participants = videoGrid.querySelectorAll('.participant');
        
        console.log('📊 Current grid state:');
        console.log('  - Total elements in grid:', videoGrid.children.length);
        console.log('  - Participant elements:', participants.length);
        console.log('  - Participants in map:', this.participants.size);
        
        if (participants.length > 0) {
            console.log('🎯 Removing first participant for test...');
            const firstParticipant = participants[0];
            console.log('  - Removing element:', firstParticipant.id);
            
            // Get the ID from the element
            const elementId = firstParticipant.id;
            const participantId = elementId.replace('guest-', '').replace('participant-', '');
            
            this.removeGuest(participantId);
        } else {
            console.log('❌ No participants to remove');
        }
    }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    console.log('📄 DOM ready, creating StreamHost...');
    window.streamHost = new StreamHost();
});

// Also initialize immediately if DOM is already ready
if (document.readyState !== 'loading') {
    console.log('📄 DOM already ready, creating StreamHost...');
    window.streamHost = new StreamHost();
} 