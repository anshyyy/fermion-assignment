import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { v4 as uuidv4 } from 'uuid';
import { MediaSoupService } from '@/modules/streaming/mediasoup.service';
import { RoomService } from '@/modules/streaming/room.service';
import {
  SocketEvents,
  UserRole,
  ConnectionState,
  IUserSession,
} from '@/types/webrtc.types';

/**
 * WebRTC Gateway
 * 
 * This gateway handles all WebSocket communication for the WebRTC streaming application.
 * It manages client connections, room joining/leaving, and coordinates with MediaSoup
 * for real-time media streaming.
 * 
 * Key responsibilities:
 * - Handle client connections and disconnections
 * - Manage room membership and user sessions
 * - Coordinate WebRTC signaling between clients and MediaSoup
 * - Handle producer and consumer lifecycle events
 * - Provide real-time updates to clients
 */
@WebSocketGateway({
  cors: {
    origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
    credentials: true,
  },
  transports: ['websocket', 'polling'],
})
export class WebRtcGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(WebRtcGateway.name);

  constructor(
    private readonly mediaSoupService: MediaSoupService,
    private readonly roomService: RoomService,
  ) {}

  /**
   * Gateway initialization - called after server starts
   */
  afterInit(server: Server): void {
    this.logger.log('🌐 WebRTC Gateway initialized');
    this.server = server;
  }

  /**
   * Handle new client connections
   */
  handleConnection(client: Socket): void {
    this.logger.log(`🔌 Client connected: ${client.id}`);
    
    // Send initial connection confirmation
    client.emit('connect-confirm', {
      socketId: client.id,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Handle client disconnections
   */
  handleDisconnect(client: Socket): void {
    this.logger.log(`🔌 Client disconnected: ${client.id}`);
    
    try {
      // Clean up user session and notify room members
      this.handleUserLeave(client);
    } catch (error) {
      this.logger.error(`Error handling disconnect for ${client.id}:`, error);
    }
  }

  /**
   * Handle user joining a room
   */
  @SubscribeMessage(SocketEvents.JOIN_ROOM)
  async handleJoinRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { roomId: string; role: UserRole; displayName?: string },
  ): Promise<void> {
    try {
      const { roomId, role, displayName } = data;
      
      this.logger.log(`👥 User ${client.id} joining room ${roomId} as ${role}`);

      // Validate room capacity
      if (role === UserRole.VIEWER) {
        const roomInfo = await this.roomService.getRoomInfo(roomId);
        if (roomInfo && this.roomService.getViewerCount(roomId) >= roomInfo.maxViewers) {
          client.emit(SocketEvents.ROOM_FULL, {
            message: 'Room is at maximum capacity',
          });
          return;
        }
      }

      // Check if room already has a streamer (only for streaming rooms, not conference rooms)
      if (role === UserRole.STREAMER && this.roomService.hasStreamer(roomId)) {
        client.emit(SocketEvents.ERROR, {
          message: 'Room already has an active streamer',
        });
        return;
      }

      // Create user session
      const userSession: IUserSession = {
        id: uuidv4(),
        socketId: client.id,
        role,
        displayName: displayName || `User-${client.id.substring(0, 6)}`,
        connectionState: ConnectionState.CONNECTING,
        producers: [],
        consumers: [],
        joinedAt: new Date(),
        lastActivity: new Date(),
      };

      // Add user to room
      await this.roomService.addUserToRoom(roomId, userSession);
      
      // Join socket room for broadcasting
      await client.join(roomId);

      // Store room association in socket data
      client.data.roomId = roomId;
      client.data.userId = userSession.id;
      client.data.role = role;

      // Update connection state
      userSession.connectionState = ConnectionState.CONNECTED;
      await this.roomService.updateUserSession(roomId, userSession);

      // Notify user about successful join
      client.emit(SocketEvents.USER_JOINED, {
        user: userSession,
        roomId,
      });

      // Send room state to new user
      const roomState = await this.roomService.getRoomState(roomId);
      client.emit('room-state', roomState);

      // Set up media consumption for viewers and conference participants
      if (role === UserRole.VIEWER) {
        const activeProducers = this.mediaSoupService.getActiveProducers(roomId);
        if (activeProducers.length > 0) {
          // Get router capabilities for the client
          const rtpCapabilities = this.mediaSoupService.getRouterCapabilities(roomId);
          client.emit('router-capabilities', { rtpCapabilities });
        } else {
          client.emit(SocketEvents.STREAM_ENDED);
        }
      } else if (role === UserRole.PARTICIPANT) {
        // For conference participants, send conference-specific join event
        client.emit('conference-joined', {
          participantId: userSession.id,
          roomId,
          participants: this.roomService.getActiveParticipants(roomId)
        });
        
        // Send router capabilities for both producing and consuming
        const rtpCapabilities = this.mediaSoupService.getRouterCapabilities(roomId);
        client.emit('router-capabilities', { rtpCapabilities });
      }

      // Broadcast user joined to other room members
      client.to(roomId).emit(SocketEvents.USER_JOINED, {
        user: userSession,
        roomId,
      });

      // Update viewer/participant count based on room type
      const remainingParticipants = this.roomService.getActiveParticipants(roomId);
      if (remainingParticipants.some(p => p.role === UserRole.PARTICIPANT)) {
        this.broadcastParticipantCount(roomId);
        this.broadcastParticipantsList(roomId);
      } else {
        this.broadcastViewerCount(roomId);
      }

      this.logger.log(`✅ User ${client.id} successfully joined room ${roomId}`);

    } catch (error) {
      this.logger.error(`❌ Error joining room:`, error);
      client.emit(SocketEvents.ERROR, {
        message: 'Failed to join room',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Handle user leaving a room
   */
  @SubscribeMessage(SocketEvents.LEAVE_ROOM)
  async handleLeaveRoom(@ConnectedSocket() client: Socket): Promise<void> {
    this.handleUserLeave(client);
  }

  /**
   * Create WebRTC transport for client
   */
  @SubscribeMessage(SocketEvents.CREATE_TRANSPORT)
  async handleCreateTransport(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { type: 'producer' | 'consumer' },
  ): Promise<void> {
    try {
      const roomId = client.data.roomId;
      if (!roomId) {
        throw new Error('User not in a room');
      }

      const { type } = data;
      
      this.logger.debug(`🚛 Creating ${type} transport for ${client.id}`);

      // Create transport using MediaSoup service
      const transportInfo = await this.mediaSoupService.createTransport(roomId, type);

      // Store transport ID in user session
      const userSession = await this.roomService.getUserSession(roomId, client.data.userId);
      if (userSession) {
        userSession.transport = transportInfo;
        await this.roomService.updateUserSession(roomId, userSession);
      }

      // Send transport info to client
      client.emit(SocketEvents.TRANSPORT_CREATED, {
        transportInfo,
        type,
      });

      this.logger.debug(`✅ ${type} transport created: ${transportInfo.id}`);

    } catch (error) {
      this.logger.error(`❌ Failed to create transport:`, error);
      client.emit(SocketEvents.ERROR, {
        message: 'Failed to create transport',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Connect WebRTC transport
   */
  @SubscribeMessage(SocketEvents.CONNECT_TRANSPORT)
  async handleConnectTransport(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { transportId: string; dtlsParameters: any },
  ): Promise<void> {
    try {
      const { transportId, dtlsParameters } = data;
      
      this.logger.debug(`🔗 Connecting transport ${transportId} for ${client.id}`);

      // Connect transport using MediaSoup service
      await this.mediaSoupService.connectTransport(transportId, dtlsParameters);

      // Confirm transport connection
      client.emit('transport-connected', { transportId });

      this.logger.debug(`✅ Transport connected: ${transportId}`);

    } catch (error) {
      this.logger.error(`❌ Failed to connect transport:`, error);
      client.emit(SocketEvents.ERROR, {
        message: 'Failed to connect transport',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Handle media production (streaming)
   */
  @SubscribeMessage(SocketEvents.PRODUCE)
  async handleProduce(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: {
      transportId: string;
      kind: 'audio' | 'video';
      rtpParameters: any;
    },
  ): Promise<void> {
    try {
      const roomId = client.data.roomId;
      const role = client.data.role;

      if (!roomId || (role !== UserRole.STREAMER && role !== UserRole.PARTICIPANT)) {
        throw new Error('Only streamers and participants can produce media');
      }

      const { transportId, kind, rtpParameters } = data;
      
      this.logger.debug(`📤 Creating producer for ${client.id} (${kind})`);

      // Create producer using MediaSoup service
      const producerInfo = await this.mediaSoupService.createProducer(
        transportId,
        rtpParameters,
        kind,
      );

      // Update user session with producer info
      const userSession = await this.roomService.getUserSession(roomId, client.data.userId);
      if (userSession) {
        userSession.producers.push(producerInfo);
        await this.roomService.updateUserSession(roomId, userSession);
      }

      // Confirm producer creation to streamer
      client.emit(SocketEvents.PRODUCER_CREATED, {
        producer: producerInfo,
      });

      // Notify other participants/viewers about new producer
      if (role === UserRole.PARTICIPANT) {
        // For conference participants, notify others that a participant started streaming
        client.to(roomId).emit('participant-started-streaming', {
          participant: userSession,
          producer: producerInfo,
        });
      } else {
        // For regular streamers, use the existing notification system
        client.to(roomId).emit(SocketEvents.NEW_PRODUCER, {
          producer: producerInfo,
          streamerId: client.data.userId,
        });

        // Broadcast stream started event
        this.server.to(roomId).emit(SocketEvents.STREAM_STARTED, {
          producer: producerInfo,
          streamer: userSession?.displayName,
        });
      }

      this.logger.log(`✅ Producer created: ${producerInfo.id} (${kind})`);

    } catch (error) {
      this.logger.error(`❌ Failed to create producer:`, error);
      client.emit(SocketEvents.ERROR, {
        message: 'Failed to start streaming',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Handle media consumption (viewing)
   */
  @SubscribeMessage(SocketEvents.CONSUME)
  async handleConsume(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: {
      transportId: string;
      producerId: string;
      rtpCapabilities: any;
    },
  ): Promise<void> {
    try {
      const roomId = client.data.roomId;
      const role = client.data.role;

      if (!roomId || (role !== UserRole.VIEWER && role !== UserRole.PARTICIPANT)) {
        throw new Error('Only viewers and participants can consume media');
      }

      const { transportId, producerId, rtpCapabilities } = data;
      
      this.logger.debug(`📥 Creating consumer for ${client.id}`);

      // Create consumer using MediaSoup service
      const consumerInfo = await this.mediaSoupService.createConsumer(
        transportId,
        producerId,
        rtpCapabilities,
      );

      // Update user session with consumer info
      const userSession = await this.roomService.getUserSession(roomId, client.data.userId);
      if (userSession) {
        userSession.consumers.push(consumerInfo);
        await this.roomService.updateUserSession(roomId, userSession);
      }

      // Send consumer info to viewer
      client.emit(SocketEvents.CONSUMER_CREATED, {
        consumer: consumerInfo,
      });

      this.logger.debug(`✅ Consumer created: ${consumerInfo.id}`);

    } catch (error) {
      this.logger.error(`❌ Failed to create consumer:`, error);
      client.emit(SocketEvents.ERROR, {
        message: 'Failed to connect to stream',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Resume consumer (start receiving media)
   */
  @SubscribeMessage(SocketEvents.RESUME_CONSUMER)
  async handleResumeConsumer(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { consumerId: string },
  ): Promise<void> {
    try {
      const { consumerId } = data;
      
      this.logger.debug(`▶️ Resuming consumer ${consumerId} for ${client.id}`);

      // Resume consumer using MediaSoup service
      await this.mediaSoupService.resumeConsumer(consumerId);

      // Confirm consumer resumed
      client.emit('consumer-resumed', { consumerId });

      this.logger.debug(`✅ Consumer resumed: ${consumerId}`);

    } catch (error) {
      this.logger.error(`❌ Failed to resume consumer:`, error);
      client.emit(SocketEvents.ERROR, {
        message: 'Failed to resume stream',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Check if stream is available
   */
  @SubscribeMessage('check-stream')
  async handleCheckStream(@ConnectedSocket() client: Socket): Promise<void> {
    try {
      const roomId = client.data.roomId || 'main-stream';
      const activeProducers = this.mediaSoupService.getActiveProducers(roomId);
      
      if (activeProducers.length > 0) {
        const rtpCapabilities = this.mediaSoupService.getRouterCapabilities(roomId);
        client.emit('stream-available', { rtpCapabilities });
      } else {
        client.emit('no-stream');
      }
    } catch (error) {
      this.logger.error('Error checking stream:', error);
      client.emit('no-stream');
    }
  }

  /**
   * Handle participant starting to stream (simplified WebRTC)
   */
  @SubscribeMessage('start-streaming')
  async handleStartStreaming(@ConnectedSocket() client: Socket): Promise<void> {
    try {
      const roomId = client.data.roomId;
      const userId = client.data.userId;
      
      if (!roomId || !userId) {
        throw new Error('User not in a room');
      }

      const userSession = await this.roomService.getUserSession(roomId, userId);
      if (!userSession) {
        throw new Error('User session not found');
      }

      this.logger.log(`📹 User ${userId} started streaming in room ${roomId}`);

      // Notify other participants that this user started streaming
      client.to(roomId).emit('participant-started-streaming', {
        participant: userSession
      });

    } catch (error) {
      this.logger.error('Error handling start streaming:', error);
      client.emit(SocketEvents.ERROR, {
        message: 'Failed to start streaming',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Handle WebRTC offer - relay between participants
   */
  @SubscribeMessage('webrtc-offer')
  async handleWebRTCOffer(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { to: string; offer: any },
  ): Promise<void> {
    try {
      this.logger.debug(`📞 Relaying WebRTC offer from ${client.id} to ${data.to}`);
      
      // Relay offer directly to target socket
      this.server.to(data.to).emit('webrtc-offer', {
        from: client.id,
        offer: data.offer
      });

    } catch (error) {
      this.logger.error('Error handling WebRTC offer:', error);
    }
  }

  /**
   * Handle WebRTC answer - relay between participants
   */
  @SubscribeMessage('webrtc-answer')
  async handleWebRTCAnswer(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { to: string; answer: any },
  ): Promise<void> {
    try {
      this.logger.debug(`📞 Relaying WebRTC answer from ${client.id} to ${data.to}`);
      
      // Relay answer directly to target socket
      this.server.to(data.to).emit('webrtc-answer', {
        from: client.id,
        answer: data.answer
      });

    } catch (error) {
      this.logger.error('Error handling WebRTC answer:', error);
    }
  }

  /**
   * Handle ICE candidate - relay between participants
   */
  @SubscribeMessage('webrtc-ice-candidate')
  async handleICECandidate(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { to: string; candidate: any },
  ): Promise<void> {
    try {
      this.logger.debug(`🧊 Relaying ICE candidate from ${client.id} to ${data.to}`);

      // Relay ICE candidate directly to target socket
      this.server.to(data.to).emit('webrtc-ice-candidate', {
        from: client.id,
        candidate: data.candidate
      });

    } catch (error) {
      this.logger.error('Error handling ICE candidate:', error);
    }
  }

  /**
   * Handle user leaving (cleanup)
   */
  private async handleUserLeave(client: Socket): Promise<void> {
    try {
      const streamId = client.data.streamId;
      
      if (!streamId) return;

      // Leave socket room
      await client.leave(streamId);

      // Handle different user types
      if (client.data.isHost) {
        // Host left - notify everyone stream ended
        this.server.to(streamId).emit('stream-ended');
        this.logger.log(`🛑 Host left - stream ended`);
        
      } else if (client.data.isGuest) {
        // Guest left - notify others
        this.server.to(streamId).emit('guest-left', {
          guestId: client.id,
          guestName: client.data.guestName
        });
        
        // Notify viewers about participant leaving
        this.server.to(streamId).emit('participant-left', {
          participantId: client.id
        });
        
        this.logger.log(`🎤 Guest "${client.data.guestName}" left`);
        
      } else if (client.data.isViewer) {
        // Viewer left - just log
        this.logger.log(`👀 Viewer "${client.data.viewerName}" left`);
      }

      // Broadcast updated counts
      this.broadcastParticipantCountUpdate(streamId);
      this.broadcastParticipantsUpdate(streamId);

      // Clear client data
      client.data.streamId = null;
      client.data.isHost = false;
      client.data.isGuest = false;
      client.data.isViewer = false;

      this.logger.log(`👋 User ${client.id} left main stream`);

    } catch (error) {
      this.logger.error(`Error handling user leave:`, error);
    }
  }

  /**
   * Broadcast viewer count to all room members
   */
  private async broadcastViewerCount(roomId: string): Promise<void> {
    try {
      const viewerCount = this.roomService.getViewerCount(roomId);
      this.server.to(roomId).emit('viewer-count', viewerCount);
    } catch (error) {
      this.logger.error('Error broadcasting viewer count:', error);
    }
  }

  /**
   * Broadcast participant count to all conference room members
   */
  private async broadcastParticipantCount(roomId: string): Promise<void> {
    try {
      const participantCount = this.roomService.getParticipantCount(roomId);
      this.server.to(roomId).emit('participant-count', participantCount);
    } catch (error) {
      this.logger.error('Error broadcasting participant count:', error);
    }
  }

  /**
   * Broadcast participants list to all conference room members
   */
  private async broadcastParticipantsList(roomId: string): Promise<void> {
    try {
      const participants = this.roomService.getActiveParticipants(roomId);
      this.server.to(roomId).emit('participants-list', participants);
    } catch (error) {
      this.logger.error('Error broadcasting participants list:', error);
    }
  }



  /**
   * Get participants list (for viewers and guests)
   */
  @SubscribeMessage('get-participants')
  async handleGetParticipants(@ConnectedSocket() client: Socket): Promise<void> {
    try {
      const streamId = 'main-stream';
      
      if (client.data.isViewer) {
        const participants = await this.getCurrentParticipants(streamId);
        client.emit('participants-update', participants);
        this.logger.debug(`📋 Sent participant list to viewer: ${participants.length} participants`);
        
      } else if (client.data.isGuest) {
        const participants = await this.getCurrentParticipantsForGuest(streamId);
        client.emit('participants-list', participants);
        this.logger.debug(`📋 Sent participant list to guest: ${participants.length} participants`);
        
      } else {
        this.logger.debug(`📋 get-participants request from non-viewer/guest: ${client.id}`);
      }
      
    } catch (error) {
      this.logger.error('Error getting participants:', error);
    }
  }





  /**
   * Start hosting the main stream
   */
  @SubscribeMessage('start-hosting')
  async handleStartHosting(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { hostName: string },
  ): Promise<void> {
    try {
      const { hostName } = data;
      const streamId = 'main-stream'; // Fixed stream ID
      
      // Store stream info in socket data
      client.data.streamId = streamId;
      client.data.hostName = hostName;
      client.data.isHost = true;
      client.data.role = 'host';

      // Join the main stream room
      await client.join(streamId);

      // Notify viewers about new host (if any viewers already there)
      client.to(streamId).emit('participant-joined', {
        participant: {
          id: client.id,
          isHost: true,
          hostName: hostName
        }
      });

      // Broadcast updated participant count and list
      this.broadcastParticipantCountUpdate(streamId);
      this.broadcastParticipantsUpdate(streamId);

      this.logger.log(`🎥 ${hostName} started hosting the main stream`);
      
      // Broadcast to all that stream is now live
      this.server.emit('stream-status-changed', {
        isLive: true,
        hostName: hostName,
        streamId: streamId
      });
      this.logger.debug(`🔍 Socket ${client.id} data:`, {
        streamId: client.data.streamId,
        hostName: client.data.hostName,
        isHost: client.data.isHost
      });

      // Verify the socket joined the room
      const roomSockets = await this.server.in(streamId).fetchSockets();
      this.logger.debug(`🏠 Room ${streamId} now has ${roomSockets.length} sockets`);

    } catch (error) {
      this.logger.error('Error starting hosting:', error);
      client.emit('error', { message: 'Failed to start hosting' });
    }
  }

  /**
   * Stop hosting the main stream
   */
  @SubscribeMessage('stop-hosting')
  async handleStopHosting(@ConnectedSocket() client: Socket): Promise<void> {
    try {
      const streamId = 'main-stream';
      
      if (client.data.isHost) {
        // Notify all participants that stream ended
        this.server.to(streamId).emit('stream-ended');
        
        // Leave the room
        await client.leave(streamId);
        
        // Clear stream data
        client.data.streamId = null;
        client.data.hostName = null;
        client.data.isHost = false;

        this.logger.log(`🛑 Main stream ended`);
        
        // Broadcast to all that stream is now offline
        this.server.emit('stream-status-changed', {
          isLive: false,
          hostName: null,
          streamId: streamId
        });
      }

    } catch (error) {
      this.logger.error('Error stopping hosting:', error);
    }
  }

  /**
   * Get status of the main stream
   */
  @SubscribeMessage('get-stream-status')
  async handleGetStreamStatus(@ConnectedSocket() client: Socket): Promise<any> {
    try {
      const streamId = 'main-stream';
      
      // Get all sockets in the main stream room
      const sockets = await this.server.in(streamId).fetchSockets();
      
      this.logger.debug(`🔍 Checking room ${streamId} with ${sockets.length} sockets:`);
      sockets.forEach((socket, index) => {
        this.logger.debug(`  Socket ${index + 1}: ${socket.id}`, {
          isHost: socket.data.isHost,
          isGuest: socket.data.isGuest,
          isViewer: socket.data.isViewer,
          hostName: socket.data.hostName,
          guestName: socket.data.guestName
        });
      });
      
      // Find the host
      const host = sockets.find(socket => socket.data.isHost);
      this.logger.debug(`🎯 Found host:`, host ? {
        id: host.id,
        hostName: host.data.hostName,
        isHost: host.data.isHost
      } : 'No host found');
      
      const status = {
        isLive: !!host,
        hostName: host?.data.hostName || null,
        participantCount: sockets.length,
        guestCount: sockets.filter(s => s.data.isGuest).length,
        viewerCount: sockets.filter(s => s.data.isViewer).length
      };

      this.logger.debug(`📊 Main stream status:`, status);
      
      // Also emit as event in case callback doesn't work
      client.emit('stream-status-response', status);
      
      // Return the status directly (Socket.io will handle the callback)
      return status;

    } catch (error) {
      this.logger.error('Error getting stream status:', error);
      // Return empty status on error
      return { isLive: false, hostName: null, participantCount: 0 };
    }
  }

  /**
   * Join main stream as viewer (watch only)
   */
  @SubscribeMessage('join-stream-as-viewer')
  async handleJoinStreamAsViewer(@ConnectedSocket() client: Socket): Promise<void> {
    try {
      const streamId = 'main-stream';
      
      // Join the main stream room
      await client.join(streamId);
      
      // Store viewer info
      client.data.streamId = streamId;
      client.data.isViewer = true;
      client.data.viewerName = 'Viewer-' + Math.random().toString(36).substr(2, 6);

      // Send current participants to the new viewer
      const participants = await this.getCurrentParticipants(streamId);
      client.emit('participants-update', participants);

      // Notify host and guests that someone is watching
      client.to(streamId).emit('viewer-joined', {
        viewerName: client.data.viewerName
      });

      // Broadcast updated participant count
      this.broadcastParticipantCountUpdate(streamId);

      this.logger.log(`👀 Viewer "${client.data.viewerName}" joined main stream`);

    } catch (error) {
      this.logger.error('Error joining as viewer:', error);
      client.emit('error', { message: 'Failed to join stream' });
    }
  }

  /**
   * Join main stream as guest (with camera)
   */
  @SubscribeMessage('join-stream-as-guest')
  async handleJoinStreamAsGuest(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { guestName: string },
  ): Promise<void> {
    try {
      const streamId = 'main-stream';
      const { guestName } = data;
      
      // Join the main stream room
      await client.join(streamId);
      
      // Store guest info
      client.data.streamId = streamId;
      client.data.isGuest = true;
      client.data.guestName = guestName;
      client.data.role = 'guest';

      // Send current participants to the new guest (so they can see host + other guests)
      const participants = await this.getCurrentParticipantsForGuest(streamId);
      client.emit('participants-list', participants);

      // Notify host and others that guest joined
      client.to(streamId).emit('guest-joined', {
        guest: {
          id: client.id,
          name: guestName,
          isGuest: true,
          guestName: guestName
        }
      });

      // Notify viewers about new participant
      client.to(streamId).emit('participant-joined', {
        participant: {
          id: client.id,
          isGuest: true,
          guestName: guestName
        }
      });

      // Broadcast updated participant count and list
      this.broadcastParticipantCountUpdate(streamId);
      this.broadcastParticipantsUpdate(streamId);

      this.logger.log(`🎤 Guest "${guestName}" joined main stream`);

    } catch (error) {
      this.logger.error('Error joining as guest:', error);
      client.emit('error', { message: 'Failed to join as guest' });
    }
  }

  /**
   * Request peer connections (for late joiners)
   */
  @SubscribeMessage('request-peer-connections')
  async handleRequestPeerConnections(@ConnectedSocket() client: Socket): Promise<void> {
    try {
      const streamId = 'main-stream';
      this.logger.debug(`🔗 ${client.id} requesting peer connections`);
      
      // Get all other participants (host and guests, not viewers)
      const sockets = await this.server.in(streamId).fetchSockets();
      const participants = sockets.filter(socket => 
        socket.id !== client.id && 
        (socket.data.isHost || socket.data.isGuest)
      );
      
      this.logger.debug(`🔗 Found ${participants.length} participants for peer connections`);
      
      // Notify each participant about the new joiner
      participants.forEach(participantSocket => {
        this.logger.debug(`🔗 Notifying ${participantSocket.id} about new joiner ${client.id}`);
        participantSocket.emit('participant-joined', {
          participant: {
            id: client.id,
            isHost: client.data.isHost || false,
            isGuest: client.data.isGuest || false,
            hostName: client.data.hostName,
            guestName: client.data.guestName
          }
        });
      });
      
    } catch (error) {
      this.logger.error('Error handling peer connection request:', error);
    }
  }

  /**
   * Get current participants in the stream
   */
  private async getCurrentParticipants(streamId: string): Promise<any[]> {
    try {
      const sockets = await this.server.in(streamId).fetchSockets();
      const participants: any[] = [];
      
      sockets.forEach(socket => {
        if (socket.data.isHost) {
          participants.push({
            id: socket.id,
            isHost: true,
            hostName: socket.data.hostName
          });
        } else if (socket.data.isGuest) {
          participants.push({
            id: socket.id,
            isGuest: true,
            guestName: socket.data.guestName
          });
        }
      });
      
      return participants;
    } catch (error) {
      this.logger.error('Error getting current participants:', error);
      return [];
    }
  }

  /**
   * Get current participants for guests (includes role info)
   */
  private async getCurrentParticipantsForGuest(streamId: string): Promise<any[]> {
    try {
      const sockets = await this.server.in(streamId).fetchSockets();
      const participants: any[] = [];
      
      sockets.forEach(socket => {
        if (socket.data.isHost) {
          participants.push({
            id: socket.id,
            isHost: true,
            hostName: socket.data.hostName,
            role: 'host',
            displayName: socket.data.hostName
          });
        } else if (socket.data.isGuest) {
          participants.push({
            id: socket.id,
            isGuest: true,
            guestName: socket.data.guestName,
            role: 'guest',
            displayName: socket.data.guestName
          });
        }
      });
      
      this.logger.debug(`📋 Participants for guest: ${participants.length} found`);
      participants.forEach(p => {
        this.logger.debug(`  - ${p.displayName} (${p.role})`);
      });
      
      return participants;
    } catch (error) {
      this.logger.error('Error getting participants for guest:', error);
      return [];
    }
  }

  /**
   * Broadcast participant count update to all room members
   */
  private async broadcastParticipantCountUpdate(streamId: string): Promise<void> {
    try {
      const sockets = await this.server.in(streamId).fetchSockets();
      const count = sockets.length;
      
      this.server.to(streamId).emit('participant-count-update', count);
    } catch (error) {
      this.logger.error('Error broadcasting participant count:', error);
    }
  }

  /**
   * Broadcast participants list update to viewers
   */
  private async broadcastParticipantsUpdate(streamId: string): Promise<void> {
    try {
      const participants: any[] = await this.getCurrentParticipants(streamId);
      
      // Only send to viewers
      const sockets = await this.server.in(streamId).fetchSockets();
      sockets.forEach(socket => {
        if (socket.data.isViewer) {
          socket.emit('participants-update', participants);
        }
      });
      
    } catch (error) {
      this.logger.error('Error broadcasting participants update:', error);
    }
  }
} 