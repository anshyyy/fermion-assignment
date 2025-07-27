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
   * Handle WebRTC offer
   */
  @SubscribeMessage('webrtc-offer')
  async handleWebRTCOffer(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { targetParticipant: string; offer: any },
  ): Promise<void> {
    try {
      const { targetParticipant, offer } = data;
      const fromParticipant = client.data.userId;
      const roomId = client.data.roomId;

      this.logger.debug(`🔄 WebRTC offer from ${fromParticipant} to ${targetParticipant}`);

      // Find target participant's socket
      const targetSession = await this.roomService.getUserSession(roomId, targetParticipant);
      if (targetSession) {
        // Forward offer to target participant
        client.to(roomId).emit('webrtc-offer', {
          fromParticipant,
          offer
        });
      }

    } catch (error) {
      this.logger.error('Error handling WebRTC offer:', error);
    }
  }

  /**
   * Handle WebRTC answer
   */
  @SubscribeMessage('webrtc-answer')
  async handleWebRTCAnswer(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { targetParticipant: string; answer: any },
  ): Promise<void> {
    try {
      const { targetParticipant, answer } = data;
      const fromParticipant = client.data.userId;
      const roomId = client.data.roomId;

      this.logger.debug(`🔄 WebRTC answer from ${fromParticipant} to ${targetParticipant}`);

      // Find target participant's socket
      const targetSession = await this.roomService.getUserSession(roomId, targetParticipant);
      if (targetSession) {
        // Forward answer to target participant
        client.to(roomId).emit('webrtc-answer', {
          fromParticipant,
          answer
        });
      }

    } catch (error) {
      this.logger.error('Error handling WebRTC answer:', error);
    }
  }

  /**
   * Handle ICE candidate
   */
  @SubscribeMessage('webrtc-ice-candidate')
  async handleICECandidate(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { targetParticipant: string; candidate: any },
  ): Promise<void> {
    try {
      const { targetParticipant, candidate } = data;
      const fromParticipant = client.data.userId;
      const roomId = client.data.roomId;

      this.logger.debug(`🧊 ICE candidate from ${fromParticipant} to ${targetParticipant}`);

      // Find target participant's socket and forward ICE candidate
      client.to(roomId).emit('webrtc-ice-candidate', {
        fromParticipant,
        candidate
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
      const roomId = client.data.roomId;
      const userId = client.data.userId;
      const role = client.data.role;

      if (!roomId || !userId) return;

      // Get user session before removal
      const userSession = await this.roomService.getUserSession(roomId, userId);

      // Remove user from room
      await this.roomService.removeUserFromRoom(roomId, userId);

      // Leave socket room
      await client.leave(roomId);

      // Close user's producers and consumers
      if (userSession) {
        // Close producers
        for (const producer of userSession.producers) {
          this.mediaSoupService.closeProducer(producer.producerId);
        }

        // Close consumers
        for (const consumer of userSession.consumers) {
          this.mediaSoupService.closeConsumer(consumer.id);
        }

        // Notify others based on user role
        if (role === UserRole.STREAMER) {
          this.server.to(roomId).emit(SocketEvents.STREAM_ENDED, {
            streamerId: userId,
          });
        } else if (role === UserRole.PARTICIPANT) {
          // Notify others that a participant stopped streaming
          this.server.to(roomId).emit('participant-stopped-streaming', {
            participantId: userId,
          });
        }
      }

      // Notify other room members
      client.to(roomId).emit(SocketEvents.USER_LEFT, {
        userId,
        roomId,
      });

      // Update viewer count
      this.broadcastViewerCount(roomId);

      this.logger.log(`👋 User ${client.id} left room ${roomId}`);

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
   * Handle request for participants list (conference mode)
   */
  @SubscribeMessage('get-participants')
  async handleGetParticipants(@ConnectedSocket() client: Socket): Promise<void> {
    try {
      const roomId = client.data.roomId;
      if (!roomId) {
        throw new Error('User not in a room');
      }

      const participants = this.roomService.getActiveParticipants(roomId);
      client.emit('participants-list', participants);

    } catch (error) {
      this.logger.error('Error getting participants:', error);
      client.emit(SocketEvents.ERROR, {
        message: 'Failed to get participants',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
} 