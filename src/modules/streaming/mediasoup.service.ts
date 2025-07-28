import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import * as mediasoup from 'mediasoup';
import { types as mediasoupTypes } from 'mediasoup';
import { v4 as uuidv4 } from 'uuid';
import { spawn, ChildProcess } from 'child_process';
import { promises as fs } from 'fs';
import { join } from 'path';
import { workerConfig, routerConfig, transportOptions, hlsConfig } from '@/config/mediasoup.config';
import { 
  ITransport, 
  IProducer, 
  IConsumer, 
  IPlainTransportInfo, 
  IHLSStreamConfig, 
  IHLSStreamInfo,
  IParticipantStreamInfo,
  StreamLayout 
} from '@/types/webrtc.types';

/**
 * MediaSoup Service
 * 
 * This service manages MediaSoup workers, routers, and transports.
 * It includes comprehensive HLS streaming support for live broadcasting
 * to viewers via FFmpeg composition and HLS generation.
 * 
 * Responsibilities:
 * - Initialize and manage MediaSoup workers
 * - Create and manage routers for streaming rooms
 * - Handle transport creation for producers and consumers
 * - Manage HLS streaming with FFmpeg integration
 * - Compose multiple participant streams for viewers
 * - Generate and serve HLS streams for scalable viewing
 */
@Injectable()
export class MediaSoupService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MediaSoupService.name);
  
  // MediaSoup infrastructure
  private workers: mediasoupTypes.Worker[] = [];
  private routers: Map<string, mediasoupTypes.Router> = new Map();
  private transports: Map<string, mediasoupTypes.Transport> = new Map();
  private producers: Map<string, mediasoupTypes.Producer> = new Map();
  private consumers: Map<string, mediasoupTypes.Consumer> = new Map();
  
  // HLS streaming infrastructure
  private plainTransports: Map<string, mediasoupTypes.PlainTransport> = new Map();
  private hlsStreams: Map<string, IHLSStreamConfig> = new Map();
  private ffmpegProcesses: Map<string, ChildProcess> = new Map();
  private participantStreams: Map<string, IParticipantStreamInfo> = new Map();
  
  // Configuration
  private readonly numWorkers = 4; // Number of workers to create
  private currentWorkerIndex = 0;

  /**
   * Initialize MediaSoup infrastructure when module starts
   */
  async onModuleInit(): Promise<void> {
    this.logger.log('🚀 Initializing MediaSoup service with HLS support...');
    
    try {
      await this.createWorkers();
      await this.createDefaultRouter();
      await this.initializeHLSDirectory();
      
      this.logger.log('✅ MediaSoup service with HLS streaming initialized successfully');
      this.logMediaSoupInfo();
      
    } catch (error) {
      this.logger.error('❌ Failed to initialize MediaSoup service:', error);
      throw error;
    }
  }

  /**
   * Clean up MediaSoup resources when module is destroyed
   */
  async onModuleDestroy(): Promise<void> {
    this.logger.log('🧹 Cleaning up MediaSoup resources...');
    
    try {
      // Stop all HLS streams
      for (const streamId of this.hlsStreams.keys()) {
        await this.stopHLSStream(streamId);
      }
      
      // Close all consumers
      for (const consumer of this.consumers.values()) {
        consumer.close();
      }
      
      // Close all producers
      for (const producer of this.producers.values()) {
        producer.close();
      }
      
      // Close all plain transports
      for (const transport of this.plainTransports.values()) {
        transport.close();
      }
      
      // Close all transports
      for (const transport of this.transports.values()) {
        transport.close();
      }
      
      // Close all routers
      for (const router of this.routers.values()) {
        router.close();
      }
      
      // Close all workers
      for (const worker of this.workers) {
        worker.close();
      }
      
      this.logger.log('✅ MediaSoup cleanup completed');
      
    } catch (error) {
      this.logger.error('❌ Error during MediaSoup cleanup:', error);
    }
  }

  /**
   * Initialize HLS output directory
   */
  private async initializeHLSDirectory(): Promise<void> {
    try {
      await fs.mkdir(hlsConfig.outputDir, { recursive: true });
      this.logger.debug(`📁 HLS directory initialized: ${hlsConfig.outputDir}`);
    } catch (error) {
      this.logger.error('❌ Failed to initialize HLS directory:', error);
      throw error;
    }
  }

  /**
   * Create MediaSoup workers based on CPU cores
   */
  private async createWorkers(): Promise<void> {
    this.logger.log(`Creating ${this.numWorkers} MediaSoup workers...`);
    
    for (let i = 0; i < this.numWorkers; i++) {
      try {
        const worker = await mediasoup.createWorker({
          logLevel: workerConfig.logLevel,
          logTags: workerConfig.logTags,
          rtcMinPort: workerConfig.rtcMinPort,
          rtcMaxPort: workerConfig.rtcMaxPort,
        });

        // Handle worker events
        worker.on('died', () => {
          this.logger.error(`🔴 MediaSoup worker ${worker.pid} died`);
          // In production, you might want to recreate the worker
        });

        this.workers.push(worker);
        this.logger.debug(`✅ Created worker ${i + 1}/${this.numWorkers} (PID: ${worker.pid})`);
        
      } catch (error) {
        this.logger.error(`❌ Failed to create worker ${i + 1}:`, error);
        throw error;
      }
    }
  }

  /**
   * Create a default router for the main streaming room
   */
  private async createDefaultRouter(): Promise<void> {
    const routerId = 'main-stream';
    const router = await this.createRouter(routerId);
    
    this.logger.log(`🔀 Created default router: ${routerId}`);
  }

  /**
   * Create a new router for a room
   */
  async createRouter(roomId: string): Promise<mediasoupTypes.Router> {
    try {
      // Get the next worker in round-robin fashion
      const worker = this.getNextWorker();
      
      // Create router with media codecs
      const router = await worker.createRouter({
        mediaCodecs: routerConfig.mediaCodecs,
      });

      // Store the router
      this.routers.set(roomId, router);
      
      this.logger.debug(`📡 Created router for room: ${roomId}`);
      return router;
      
    } catch (error) {
      this.logger.error(`❌ Failed to create router for room ${roomId}:`, error);
      throw error;
    }
  }

  /**
   * Get router for a specific room
   */
  getRouter(roomId: string): mediasoupTypes.Router | undefined {
    return this.routers.get(roomId);
  }

  /**
   * Create a WebRTC transport for producing or consuming media
   */
  async createTransport(
    roomId: string,
    type: 'producer' | 'consumer',
  ): Promise<ITransport> {
    try {
      const router = this.getRouter(roomId);
      if (!router) {
        throw new Error(`Router not found for room: ${roomId}`);
      }

      // Create WebRTC transport
      const transport = await router.createWebRtcTransport({
        listenIps: transportOptions.listenIps,
        enableUdp: transportOptions.enableUdp,
        enableTcp: transportOptions.enableTcp,
        preferUdp: transportOptions.preferUdp,
        initialAvailableOutgoingBitrate: transportOptions.initialAvailableOutgoingBitrate,
      });

      // Store the WebRTC transport
      this.logger.debug(`🚛 [DEBUG] Storing WebRTC transport: ${transport.id}`);
      this.transports.set(transport.id, transport);

      // Handle transport events
      transport.on('dtlsstatechange', (dtlsState) => {
        this.logger.debug(`🔐 Transport ${transport.id} DTLS state: ${dtlsState}`);
      });

      // Note: The 'close' event is handled internally by MediaSoup
      // We manually clean up transports when needed

      const transportInfo: ITransport = {
        id: transport.id,
        iceParameters: transport.iceParameters,
        iceCandidates: transport.iceCandidates,
        dtlsParameters: transport.dtlsParameters,
      };

      this.logger.debug(`🚛 Created ${type} transport: ${transport.id}`);
      return transportInfo;
      
    } catch (error) {
      this.logger.error(`❌ Failed to create ${type} transport for room ${roomId}:`, error);
      throw error;
    }
  }

  /**
   * Connect a transport with DTLS parameters
   */
  async connectTransport(
    transportId: string,
    dtlsParameters: mediasoupTypes.DtlsParameters,
  ): Promise<void> {
    try {
      this.logger.debug(`🔗 [DEBUG] Connecting transport ${transportId}`);
      
      // Check if this might be a plain transport ID accidentally passed
      if (this.plainTransports.has(transportId)) {
        this.logger.error(`🔗 [DEBUG] ERROR: Plain transport ID ${transportId} passed to connectTransport! This should be a WebRTC transport ID.`);
        throw new Error(`Cannot connect plain transport with DTLS. Plain transports are for FFmpeg, not client connections.`);
      }
      
      const transport = this.transports.get(transportId);
      if (!transport) {
        this.logger.error(`🔗 [DEBUG] WebRTC transport not found: ${transportId}`);
        this.logger.error(`🔗 [DEBUG] Available WebRTC transports: ${Array.from(this.transports.keys()).join(', ')}`);
        throw new Error(`WebRTC transport not found: ${transportId}`);
      }

      // Check if transport supports DTLS connection
      if (!('connect' in transport) || typeof transport.connect !== 'function') {
        this.logger.error(`🔗 [DEBUG] Transport does not support connect method`);
        throw new Error('Transport does not support DTLS connection');
      }

      await transport.connect({ dtlsParameters });
      this.logger.debug(`🔗 Connected transport: ${transportId}`);
      
    } catch (error) {
      this.logger.error(`❌ Failed to connect transport ${transportId}:`, error);
      throw error;
    }
  }

  /**
   * Create a producer for sending media
   */
  async createProducer(
    transportId: string,
    rtpParameters: mediasoupTypes.RtpParameters,
    kind: mediasoupTypes.MediaKind,
  ): Promise<IProducer> {
    try {
      this.logger.log(`🎬 [DEBUG] Creating ${kind} producer on transport ${transportId}`);
      this.logger.log(`🎬 [DEBUG] Looking for transport in transports map, total transports: ${this.transports.size}`);
      this.logger.log(`🎬 [DEBUG] Available WebRTC transport IDs: ${Array.from(this.transports.keys()).join(', ')}`);
      this.logger.log(`🎬 [DEBUG] Available plain transport IDs: ${Array.from(this.plainTransports.keys()).join(', ')}`);
      
      // Check if this might be a plain transport ID accidentally passed
      if (this.plainTransports.has(transportId)) {
        this.logger.error(`🎬 [DEBUG] ERROR: Plain transport ID ${transportId} passed to createProducer! This should be a WebRTC transport ID.`);
        throw new Error(`Cannot create producer on plain transport. Plain transports are for FFmpeg, not client producers.`);
      }
      
      const transport = this.transports.get(transportId);
      if (!transport) {
        this.logger.error(`🎬 [DEBUG] WebRTC transport not found: ${transportId}`);
        this.logger.error(`🎬 [DEBUG] Available WebRTC transports: ${Array.from(this.transports.keys()).join(', ')}`);
        this.logger.error(`🎬 [DEBUG] Check if transport was created properly or if wrong ID is being used`);
        throw new Error(`WebRTC transport not found: ${transportId}`);
      }

      this.logger.log(`🎬 [DEBUG] Found transport: ${transport.constructor.name}`);
      
      // Check if transport supports media production
      if (!('produce' in transport) || typeof transport.produce !== 'function') {
        this.logger.error(`🎬 [DEBUG] Transport does not support produce method`);
        throw new Error('Transport does not support media production');
      }

      const webrtcTransport = transport as mediasoupTypes.WebRtcTransport;
      
      const producer = await webrtcTransport.produce({
        kind,
        rtpParameters,
      });

      // Store the producer
      this.producers.set(producer.id, producer);
      this.logger.log(`🎬 [DEBUG] Producer stored with ID: ${producer.id}, total producers: ${this.producers.size}`);

      // Handle producer events
      producer.on('transportclose', () => {
        this.logger.debug(`🚛 Producer ${producer.id} transport closed`);
        this.producers.delete(producer.id);
      });

      const producerInfo: IProducer = {
        id: uuidv4(),
        kind: producer.kind,
        rtpParameters: producer.rtpParameters,
        type: producer.type,
        producerId: producer.id,
      };

      this.logger.log(`✅ [DEBUG] Created ${kind} producer: ${producer.id}, MediaSoup Producer ID: ${producer.id}`);
      
      // Debug: List all current producers
      this.logger.log(`🎬 [DEBUG] Current producers: ${Array.from(this.producers.keys()).join(', ')}`);
      
      return producerInfo;
      
    } catch (error) {
      this.logger.error(`❌ Failed to create producer on transport ${transportId}:`, error);
      throw error;
    }
  }

  /**
   * Create a consumer for receiving media
   */
  async createConsumer(
    transportId: string,
    producerId: string,
    rtpCapabilities: mediasoupTypes.RtpCapabilities,
  ): Promise<IConsumer> {
    try {
      this.logger.debug(`📥 [DEBUG] Creating consumer for producer ${producerId} on transport ${transportId}`);
      
      // Check if this might be a plain transport ID accidentally passed
      if (this.plainTransports.has(transportId)) {
        this.logger.error(`📥 [DEBUG] ERROR: Plain transport ID ${transportId} passed to createConsumer! This should be a WebRTC transport ID.`);
        throw new Error(`Cannot create consumer on plain transport. Plain transports are for FFmpeg, not client consumers.`);
      }
      
      const transport = this.transports.get(transportId);
      if (!transport) {
        this.logger.error(`📥 [DEBUG] WebRTC transport not found: ${transportId}`);
        this.logger.error(`📥 [DEBUG] Available WebRTC transports: ${Array.from(this.transports.keys()).join(', ')}`);
        throw new Error(`WebRTC transport not found: ${transportId}`);
      }

      const producer = this.producers.get(producerId);
      if (!producer) {
        this.logger.error(`📥 [DEBUG] Producer not found: ${producerId}`);
        this.logger.error(`📥 [DEBUG] Available producers: ${Array.from(this.producers.keys()).join(', ')}`);
        throw new Error(`Producer not found: ${producerId}`);
      }

      // Check if transport supports media consumption
      if (!('consume' in transport) || typeof transport.consume !== 'function') {
        this.logger.error(`📥 [DEBUG] Transport does not support consume method`);
        throw new Error('Transport does not support media consumption');
      }

      const webrtcTransport = transport as mediasoupTypes.WebRtcTransport;
      const router = this.getRouterByTransport(transportId);
      
      if (!router) {
        throw new Error('Router not found for transport');
      }

      // Check if router can consume this producer
      if (!router.canConsume({ producerId, rtpCapabilities })) {
        throw new Error('Cannot consume this producer');
      }

      const consumer = await webrtcTransport.consume({
        producerId,
        rtpCapabilities,
        paused: true, // Start paused
      });

      // Store the consumer
      this.consumers.set(consumer.id, consumer);

      // Handle consumer events
      consumer.on('transportclose', () => {
        this.logger.debug(`🚛 Consumer ${consumer.id} transport closed`);
        this.consumers.delete(consumer.id);
      });

      consumer.on('producerclose', () => {
        this.logger.debug(`📤 Consumer ${consumer.id} producer closed`);
        this.consumers.delete(consumer.id);
      });

      const consumerInfo: IConsumer = {
        id: consumer.id,
        producerId: consumer.producerId,
        kind: consumer.kind,
        rtpParameters: consumer.rtpParameters,
        type: consumer.type,
        producerPaused: consumer.producerPaused,
      };

      this.logger.debug(`📥 Created consumer: ${consumer.id}`);
      return consumerInfo;
      
    } catch (error) {
      this.logger.error(`❌ Failed to create consumer on transport ${transportId}:`, error);
      throw error;
    }
  }

  /**
   * Resume a paused consumer
   */
  async resumeConsumer(consumerId: string): Promise<void> {
    try {
      const consumer = this.consumers.get(consumerId);
      if (!consumer) {
        throw new Error(`Consumer not found: ${consumerId}`);
      }

      await consumer.resume();
      this.logger.debug(`▶️ Resumed consumer: ${consumerId}`);
      
    } catch (error) {
      this.logger.error(`❌ Failed to resume consumer ${consumerId}:`, error);
      throw error;
    }
  }

  /**
   * Get the next worker in round-robin fashion
   */
  private getNextWorker(): mediasoupTypes.Worker {
    const worker = this.workers[this.currentWorkerIndex];
    this.currentWorkerIndex = (this.currentWorkerIndex + 1) % this.workers.length;
    return worker;
  }

  /**
   * Find router by transport ID
   */
  private getRouterByTransport(transportId: string): mediasoupTypes.Router | undefined {
    // In a more complex setup, you'd maintain a mapping between transports and routers
    // For now, we'll use the main router
    return this.routers.get('main-stream');
  }

  /**
   * Get MediaSoup router capabilities for a room
   */
  getRouterCapabilities(roomId: string): mediasoupTypes.RtpCapabilities | undefined {
    const router = this.getRouter(roomId);
    return router?.rtpCapabilities;
  }

  /**
   * Close a producer
   */
  closeProducer(producerId: string): void {
    const producer = this.producers.get(producerId);
    if (producer) {
      producer.close();
      this.producers.delete(producerId);
      this.logger.debug(`🗑️ Closed producer: ${producerId}`);
    }
  }

  /**
   * Close a consumer
   */
  closeConsumer(consumerId: string): void {
    const consumer = this.consumers.get(consumerId);
    if (consumer) {
      consumer.close();
      this.consumers.delete(consumerId);
      this.logger.debug(`🗑️ Closed consumer: ${consumerId}`);
    }
  }

  /**
   * Get all active producers for a room
   */
  getActiveProducers(roomId: string): mediasoupTypes.Producer[] {
    // This is a simplified implementation
    // In production, you'd maintain proper room-to-producer mappings
    return Array.from(this.producers.values());
  }

  /**
   * Create a plain transport for RTP streaming to FFmpeg
   */
  async createPlainTransport(
    roomId: string,
    mediaType: 'video' | 'audio'
  ): Promise<IPlainTransportInfo> {
    try {
      const router = this.getRouter(roomId);
      if (!router) {
        throw new Error(`Router not found for room: ${roomId}`);
      }

      // Create plain transport for RTP with dynamic port assignment
      const plainTransport = await router.createPlainTransport({
        listenIp: { ip: '127.0.0.1', announcedIp: undefined },
        rtcpMux: false,
        comedia: true, // Enable comedia for easier RTP flow
      });

      // Store the plain transport
      this.logger.debug(`🚛 [DEBUG] Storing plain transport: ${plainTransport.id}`);
      this.plainTransports.set(plainTransport.id, plainTransport);

      // Handle transport events
      plainTransport.on('tuple', (tuple) => {
        this.logger.debug(`📡 Plain transport ${plainTransport.id} tuple: ${JSON.stringify(tuple)}`);
      });

      plainTransport.on('rtcptuple', (rtcpTuple) => {
        this.logger.debug(`📡 Plain transport ${plainTransport.id} RTCP tuple: ${JSON.stringify(rtcpTuple)}`);
      });

      const transportInfo: IPlainTransportInfo = {
        id: plainTransport.id,
        ip: plainTransport.tuple.localIp,
        port: plainTransport.tuple.localPort,
        rtcpPort: plainTransport.rtcpTuple?.localPort,
      };

      this.logger.debug(`🚛 Created plain transport for ${mediaType}: ${plainTransport.id} on port ${transportInfo.port}`);
      return transportInfo;
      
    } catch (error) {
      this.logger.error(`❌ Failed to create plain transport for ${mediaType}:`, error);
      throw error;
    }
  }

  /**
   * Start HLS streaming for a room
   */
  async startHLSStream(roomId: string, participantIds: string[]): Promise<IHLSStreamInfo> {
    try {
      this.logger.log(`🎬 Starting HLS stream for room: ${roomId}`);

      // Check if HLS stream already exists
      if (this.hlsStreams.has(roomId)) {
        throw new Error(`HLS stream already exists for room: ${roomId}`);
      }

      // Create output directory for this stream
      const streamOutputDir = join(hlsConfig.outputDir, roomId);
      await fs.mkdir(streamOutputDir, { recursive: true });

      // Create HLS stream configuration
      const hlsStreamConfig: IHLSStreamConfig = {
        streamId: roomId,
        outputPath: streamOutputDir,
        participantIds,
        isActive: true,
        startedAt: new Date(),
        segmentDuration: hlsConfig.segmentDuration,
        playlistLength: hlsConfig.playlistLength,
      };

      this.hlsStreams.set(roomId, hlsStreamConfig);

      // Start FFmpeg process for stream composition and HLS generation
      await this.startFFmpegProcess(roomId, participantIds);

      // Start health monitoring for this stream
      this.startHLSHealthMonitoring(roomId);

      const streamInfo: IHLSStreamInfo = {
        streamId: roomId,
        playlistUrl: `/hls/${roomId}/playlist.m3u8`,
        participantCount: participantIds.length,
        isLive: true,
        startedAt: hlsStreamConfig.startedAt,
        duration: 0,
      };

      this.logger.log(`✅ HLS stream started for room: ${roomId} with health monitoring`);
      return streamInfo;

    } catch (error) {
      this.logger.error(`❌ Failed to start HLS stream for room ${roomId}:`, error);
      throw error;
    }
  }

  /**
   * Stop HLS streaming for a room
   */
  async stopHLSStream(roomId: string): Promise<void> {
    try {
      this.logger.log(`🛑 Stopping HLS stream for room: ${roomId}`);

      // Stop FFmpeg process
      const ffmpegProcess = this.ffmpegProcesses.get(roomId);
      if (ffmpegProcess) {
        ffmpegProcess.kill('SIGTERM');
        this.ffmpegProcesses.delete(roomId);
      }

      // Close plain transports for this stream
      for (const [transportId, transport] of this.plainTransports) {
        if (transportId.startsWith(roomId)) {
          transport.close();
          this.plainTransports.delete(transportId);
        }
      }

      // Stop health monitoring
      const healthCheck = this.hlsHealthChecks?.get(roomId);
      if (healthCheck) {
        clearInterval(healthCheck);
        this.hlsHealthChecks.delete(roomId);
      }

      // Remove HLS stream configuration
      this.hlsStreams.delete(roomId);

      this.logger.log(`✅ HLS stream stopped for room: ${roomId}`);

    } catch (error) {
      this.logger.error(`❌ Failed to stop HLS stream for room ${roomId}:`, error);
      throw error;
    }
  }

    /**
   * Start FFmpeg process for stream composition and HLS generation
   */
  private async startFFmpegProcess(roomId: string, participantIds: string[]): Promise<void> {
    try {
      const hlsStream = this.hlsStreams.get(roomId);
      if (!hlsStream) {
        throw new Error(`HLS stream not found: ${roomId}`);
      }

      const outputPath = join(hlsStream.outputPath, 'playlist.m3u8');
      const participantCount = participantIds.length;
      
      this.logger.log(`🎬 Starting FFmpeg for ${participantCount} participants`);
      
      // Get active producers for participants
      const allProducers = Array.from(this.producers.values());
      const videoProducers = allProducers.filter(p => p.kind === 'video');
      const audioProducers = allProducers.filter(p => p.kind === 'audio');
      
      this.logger.log(`🎬 [DEBUG] Total producers in system: ${this.producers.size}`);
      this.logger.log(`🎬 [DEBUG] All producer IDs: ${Array.from(this.producers.keys()).join(', ')}`);
      this.logger.log(`🎬 [DEBUG] Video producers: ${videoProducers.length}, Audio producers: ${audioProducers.length}`);
      
      const plainTransports = [];
      const rtpInputs = [];
      const connectedProducers = [];
      
      if (videoProducers.length > 0 || audioProducers.length > 0) {
        this.logger.log(`🎥 [DEBUG] Found ${videoProducers.length} video and ${audioProducers.length} audio producers - proceeding with real streams`);
        
        // Process video producers (max 4 for performance)
        const maxProducers = Math.min(videoProducers.length, 4);
        for (let i = 0; i < maxProducers; i++) {
          try {
            const videoProducer = videoProducers[i];
            const videoTransport = await this.createPlainTransport(roomId, 'video');
            
            // Pipe the video producer to the plain transport
            this.logger.log(`🔗 [DEBUG] Attempting to pipe video producer ${videoProducer.id} to plain transport ${videoTransport.id}`);
            await this.pipeProducerToPlainTransport(videoProducer.id, videoTransport.id);
            connectedProducers.push(videoProducer.id);
            this.logger.log(`✅ [DEBUG] Successfully piped video producer ${videoProducer.id}`);
            
            plainTransports.push(videoTransport);
            
            // Add video RTP input for FFmpeg
            rtpInputs.push(
              '-f', 'rtp',
              '-i', `rtp://127.0.0.1:${videoTransport.port}`
            );
            
            this.logger.debug(`📡 Connected video producer ${videoProducer.id} to plain transport: ${videoTransport.port}`);
          } catch (error) {
            this.logger.warn(`⚠️ Failed to connect video producer ${i + 1}:`, error);
          }
        }
        
        // Process audio producers (use first available)
        if (audioProducers.length > 0) {
          try {
            const audioProducer = audioProducers[0]; // Use first audio producer
            const audioTransport = await this.createPlainTransport(roomId, 'audio');
            
            // Pipe the audio producer to the plain transport  
            await this.pipeProducerToPlainTransport(audioProducer.id, audioTransport.id);
            connectedProducers.push(audioProducer.id);
            
            plainTransports.push(audioTransport);
            
            // Add audio RTP input for FFmpeg
            rtpInputs.push(
              '-f', 'rtp',
              '-i', `rtp://127.0.0.1:${audioTransport.port}`
            );
            
            this.logger.debug(`📡 Connected audio producer ${audioProducer.id} to plain transport: ${audioTransport.port}`);
          } catch (error) {
            this.logger.warn(`⚠️ Failed to connect audio producer:`, error);
          }
        }
      }
      
      // FFmpeg command for generating HLS from RTP streams
      let ffmpegArgs = [];
      
      if (rtpInputs.length > 0 && connectedProducers.length > 0) {
        // Use real RTP inputs from participants
        const videoInputCount = videoProducers.length > 0 ? Math.min(videoProducers.length, 4) : 0;
        const hasAudio = audioProducers.length > 0;
        
        ffmpegArgs = [
          ...rtpInputs,
        ];
        
        if (videoInputCount > 1) {
          // Multiple video streams - create layout
          ffmpegArgs.push(
            '-filter_complex', this.generateVideoLayout(videoInputCount),
            '-map', '[output]'
          );
        } else if (videoInputCount === 1) {
          // Single video stream
          ffmpegArgs.push(
            '-map', '0:v' // Map first video input
          );
        }
        
        if (hasAudio) {
          // Add audio mapping (audio input comes after video inputs)
          const audioInputIndex = videoInputCount;
          ffmpegArgs.push('-map', `${audioInputIndex}:a`);
        }
        
        this.logger.log(`🎥 [DEBUG] Using real participant streams: ${videoInputCount} video, ${hasAudio ? 1 : 0} audio (connected producers: ${connectedProducers.length})`);
      } else {
        // Fallback to test pattern when no participants or connection failed
        this.logger.log(`🎪 [DEBUG] FALLING BACK TO TEST PATTERN!`);
        this.logger.log(`🎪 [DEBUG] Reason: rtpInputs.length=${rtpInputs.length}, connectedProducers.length=${connectedProducers.length}`);
        this.logger.log(`🎪 [DEBUG] Total producers: ${this.producers.size}, videoProducers: ${videoProducers.length}, audioProducers: ${audioProducers.length}`);
        
        ffmpegArgs = [
          '-f', 'lavfi',
          '-i', 'testsrc=size=1280x720:rate=30',
          '-f', 'lavfi', 
          '-i', 'sine=frequency=1000',
        ];
        
        this.logger.log(`🎪 [DEBUG] Using test pattern (no active participants or connection failed)`);
      }
      
      // Common encoding and HLS output settings (optimized for real-time)
      ffmpegArgs = ffmpegArgs.concat([
        // Real-time processing options
        '-fflags', '+genpts+flush_packets',  // Generate PTS and flush packets immediately
        '-avioflags', '+direct',             // Direct I/O for lower latency
        '-max_delay', '0',                   // Minimize delay
        '-reorder_queue_size', '0',          // Disable packet reordering
        
        // Video encoding with real-time optimizations
        '-c:v', hlsConfig.ffmpeg.videoCodec,
        '-pix_fmt', 'yuv420p',               // Force YUV420p for compatibility
        '-preset', hlsConfig.ffmpeg.preset,  // veryfast for real-time
        '-tune', hlsConfig.ffmpeg.tune,      // zerolatency
        '-profile:v', hlsConfig.ffmpeg.profile, // baseline for fast decoding
        '-b:v', hlsConfig.ffmpeg.videoBitrate,
        '-maxrate', hlsConfig.ffmpeg.videoBitrate, // Constrain max bitrate
        '-bufsize', '400k',                  // Small buffer for low latency
        '-r', hlsConfig.ffmpeg.videoFrameRate.toString(),
        '-s', hlsConfig.ffmpeg.videoResolution,
        '-g', '50',                          // GOP size (2 seconds at 25fps)
        '-keyint_min', '25',                 // Minimum keyframe interval
        '-x264-params', 'nal-hrd=cbr',       // Constant bitrate for smooth streaming
        
        // Audio encoding with low latency
        '-c:a', hlsConfig.ffmpeg.audioCodec,
        '-b:a', hlsConfig.ffmpeg.audioBitrate,
        '-ar', hlsConfig.ffmpeg.audioSampleRate.toString(),
        '-ac', '2',                          // Stereo audio
        
        // HLS output configuration (optimized for low latency)
        '-f', 'hls',
        '-hls_time', hlsConfig.ffmpeg.hlsTime.toString(),
        '-hls_list_size', hlsConfig.ffmpeg.hlsListSize.toString(),
        '-hls_flags', 'delete_segments+independent_segments+temp_file',
        '-hls_segment_type', 'mpegts',       // Use MPEG-TS for better streaming
        '-hls_segment_filename', join(hlsStream.outputPath, 'segment_%03d.ts'),
        '-hls_playlist_type', 'event',       // Event playlist for live streaming
        '-start_number', '0',                // Start segment numbering from 0
        '-hls_allow_cache', '0',             // Disable caching for live content
        
        // Output file
        outputPath
      ]);

      this.logger.debug(`🎬 Starting FFmpeg with args: ${ffmpegArgs.join(' ')}`);

      // Spawn FFmpeg process
      const ffmpegProcess = spawn('ffmpeg', ffmpegArgs, {
        stdio: ['ignore', 'pipe', 'pipe']
      });

      // Handle FFmpeg process events
      ffmpegProcess.stdout?.on('data', (data) => {
        this.logger.debug(`FFmpeg stdout: ${data.toString()}`);
      });

      ffmpegProcess.stderr?.on('data', (data) => {
        this.logger.debug(`FFmpeg stderr: ${data.toString()}`);
      });

      ffmpegProcess.on('error', (error) => {
        this.logger.error(`FFmpeg process error for room ${roomId}:`, error);
      });

      ffmpegProcess.on('exit', (code, signal) => {
        this.logger.log(`FFmpeg process exited for room ${roomId} with code ${code}, signal ${signal}`);
        this.ffmpegProcesses.delete(roomId);
      });

      // Store the process
      this.ffmpegProcesses.set(roomId, ffmpegProcess);

      this.logger.log(`🎬 FFmpeg process started for room: ${roomId}`);

    } catch (error) {
      this.logger.error(`❌ Failed to start FFmpeg process for room ${roomId}:`, error);
      throw error;
    }
  }

  /**
   * Generate video layout filter for multiple participants (optimized for real-time)
   */
  private generateVideoLayout(participantCount: number): string {
    // Use smaller resolutions for better real-time performance (matching 960x540 output)
    if (participantCount === 1) {
      return '[0:v]scale=960:540:force_original_aspect_ratio=decrease,pad=960:540:(ow-iw)/2:(oh-ih)/2[output]';
    } else if (participantCount === 2) {
      // Side by side layout
      return '[0:v]scale=480:540:force_original_aspect_ratio=decrease,pad=480:540:(ow-iw)/2:(oh-ih)/2[left];[1:v]scale=480:540:force_original_aspect_ratio=decrease,pad=480:540:(ow-iw)/2:(oh-ih)/2[right];[left][right]hstack=inputs=2[output]';
    } else if (participantCount === 3) {
      // Top 2, bottom 1 layout
      return '[0:v]scale=480:270:force_original_aspect_ratio=decrease,pad=480:270:(ow-iw)/2:(oh-ih)/2[top_left];[1:v]scale=480:270:force_original_aspect_ratio=decrease,pad=480:270:(ow-iw)/2:(oh-ih)/2[top_right];[2:v]scale=960:270:force_original_aspect_ratio=decrease,pad=960:270:(ow-iw)/2:(oh-ih)/2[bottom];[top_left][top_right]hstack=inputs=2[top];[top][bottom]vstack=inputs=2[output]';
    } else {
      // 2x2 grid layout for 4+ participants
      return '[0:v]scale=480:270:force_original_aspect_ratio=decrease,pad=480:270:(ow-iw)/2:(oh-ih)/2[tl];[1:v]scale=480:270:force_original_aspect_ratio=decrease,pad=480:270:(ow-iw)/2:(oh-ih)/2[tr];[2:v]scale=480:270:force_original_aspect_ratio=decrease,pad=480:270:(ow-iw)/2:(oh-ih)/2[bl];[3:v]scale=480:270:force_original_aspect_ratio=decrease,pad=480:270:(ow-iw)/2:(oh-ih)/2[br];[tl][tr]hstack=inputs=2[top];[bl][br]hstack=inputs=2[bottom];[top][bottom]vstack=inputs=2[output]';
    }
  }

  /**
   * Get HLS stream info for a room
   */
  getHLSStreamInfo(roomId: string): IHLSStreamInfo | undefined {
    const hlsStream = this.hlsStreams.get(roomId);
    if (!hlsStream) {
      return undefined;
    }

    const duration = Date.now() - hlsStream.startedAt.getTime();

    return {
      streamId: hlsStream.streamId,
      playlistUrl: `/hls/${roomId}/playlist.m3u8`,
      participantCount: hlsStream.participantIds.length,
      isLive: hlsStream.isActive,
      startedAt: hlsStream.startedAt,
      duration: Math.floor(duration / 1000), // in seconds
    };
  }

  /**
   * Check if HLS stream is active for a room
   */
  isHLSStreamActive(roomId: string): boolean {
    const hlsStream = this.hlsStreams.get(roomId);
    return hlsStream?.isActive || false;
  }

  /**
   * Add participant to HLS stream
   */
  async addParticipantToHLSStream(
    roomId: string, 
    participantId: string, 
    streamInfo: IParticipantStreamInfo
  ): Promise<void> {
    try {
      this.participantStreams.set(participantId, streamInfo);
      
      const hlsStream = this.hlsStreams.get(roomId);
      if (hlsStream && !hlsStream.participantIds.includes(participantId)) {
        hlsStream.participantIds.push(participantId);
        
        // If this is the first participant, start HLS stream
        if (hlsStream.participantIds.length === 1) {
          await this.startHLSStream(roomId, [participantId]);
        }
        
        this.logger.debug(`👤 Added participant ${participantId} to HLS stream ${roomId}`);
      }

    } catch (error) {
      this.logger.error(`❌ Failed to add participant to HLS stream:`, error);
      throw error;
    }
  }

  /**
   * Remove participant from HLS stream
   */
  async removeParticipantFromHLSStream(roomId: string, participantId: string): Promise<void> {
    try {
      this.participantStreams.delete(participantId);
      
      const hlsStream = this.hlsStreams.get(roomId);
      if (hlsStream) {
        hlsStream.participantIds = hlsStream.participantIds.filter(id => id !== participantId);
        
        // If no participants left, stop HLS stream
        if (hlsStream.participantIds.length === 0) {
          await this.stopHLSStream(roomId);
        }
        
        this.logger.debug(`👤 Removed participant ${participantId} from HLS stream ${roomId}`);
      }

    } catch (error) {
      this.logger.error(`❌ Failed to remove participant from HLS stream:`, error);
      throw error;
    }
  }

  /**
   * Get all active HLS streams
   */
  getAllHLSStreams(): IHLSStreamInfo[] {
    const streams: IHLSStreamInfo[] = [];
    
    for (const [roomId, hlsStream] of this.hlsStreams) {
      if (hlsStream.isActive) {
        const duration = Date.now() - hlsStream.startedAt.getTime();
        streams.push({
          streamId: hlsStream.streamId,
          playlistUrl: `/hls/${roomId}/playlist.m3u8`,
          participantCount: hlsStream.participantIds.length,
          isLive: hlsStream.isActive,
          startedAt: hlsStream.startedAt,
          duration: Math.floor(duration / 1000),
        });
      }
    }
    
    return streams;
  }

  /**
   * Log MediaSoup service information including HLS streams
   */
  private logMediaSoupInfo(): void {
    this.logger.log(`📊 MediaSoup Service Status:`);
    this.logger.log(`   Workers: ${this.workers.length}`);
    this.logger.log(`   Routers: ${this.routers.size}`);
    this.logger.log(`   Transports: ${this.transports.size}`);
    this.logger.log(`   Plain Transports: ${this.plainTransports.size}`);
    this.logger.log(`   Producers: ${this.producers.size}`);
    this.logger.log(`   Consumers: ${this.consumers.size}`);
    this.logger.log(`   HLS Streams: ${this.hlsStreams.size}`);
    this.logger.log(`   FFmpeg Processes: ${this.ffmpegProcesses.size}`);
  }

  /**
   * Pipe a producer to a plain transport for RTP streaming to FFmpeg
   */
  async pipeProducerToPlainTransport(
    producerId: string,
    plainTransportId: string
  ): Promise<mediasoupTypes.Consumer> {
    try {
      const producer = this.producers.get(producerId);
      if (!producer) {
        throw new Error(`Producer not found: ${producerId}`);
      }

      const plainTransport = this.plainTransports.get(plainTransportId);
      if (!plainTransport) {
        throw new Error(`Plain transport not found: ${plainTransportId}`);
      }

      // Get the router that contains this producer
      const router = this.getRouterByProducer(producerId);
      if (!router) {
        throw new Error(`Router not found for producer: ${producerId}`);
      }

      // Check if we can consume this producer on the plain transport
      if (!router.canConsume({ producerId, rtpCapabilities: router.rtpCapabilities })) {
        throw new Error(`Cannot consume producer ${producerId} on plain transport`);
      }

      // Create a consumer on the plain transport to pipe the producer
      const consumer = await plainTransport.consume({
        producerId,
        rtpCapabilities: router.rtpCapabilities,
        paused: false,
      });

      // Store the consumer
      this.consumers.set(consumer.id, consumer);

      // Handle consumer events
      consumer.on('transportclose', () => {
        this.logger.debug(`🚛 Consumer ${consumer.id} transport closed`);
        this.consumers.delete(consumer.id);
      });

      consumer.on('producerclose', () => {
        this.logger.debug(`📤 Producer closed for consumer ${consumer.id}`);
        this.consumers.delete(consumer.id);
      });

      this.logger.debug(`🔗 Piped producer ${producerId} to plain transport ${plainTransportId} via consumer ${consumer.id}`);
      return consumer;

    } catch (error) {
      this.logger.error(`❌ Failed to pipe producer ${producerId} to plain transport ${plainTransportId}:`, error);
      throw error;
    }
  }

  /**
   * Get router by producer ID
   */
  private getRouterByProducer(producerId: string): mediasoupTypes.Router | undefined {
    const producer = this.producers.get(producerId);
    if (!producer) {
      return undefined;
    }

    // Find which router contains this producer by checking the producer's transport
    // This is more reliable than trying router.canConsume
    for (const [, router] of this.routers) {
      try {
        // Get all transports for this router and check if any contains our producer
        for (const [transportId, transport] of this.transports) {
          if (transport.constructor.name === 'WebRtcTransport') {
            const webrtcTransport = transport as mediasoupTypes.WebRtcTransport;
            // Check if this transport belongs to the router (indirect check via router capability)
            try {
              if (router.canConsume({ producerId, rtpCapabilities: router.rtpCapabilities })) {
                return router;
              }
            } catch (e) {
              // Continue if this router can't consume this producer
            }
          }
        }
      } catch (error) {
        // Continue to next router if error occurs
        continue;
      }
    }

    // Fallback: return the first available router (for single-router setups)
    const routers = Array.from(this.routers.values());
    if (routers.length > 0) {
      this.logger.debug(`🔄 Using fallback router for producer ${producerId}`);
      return routers[0];
    }

    return undefined;
  }

  /**
   * Get active producers for participants in a room
   */
  getActiveProducersForParticipants(participantIds: string[]): { participantId: string; producers: mediasoupTypes.Producer[] }[] {
    const result: { participantId: string; producers: mediasoupTypes.Producer[] }[] = [];
    
    // This is a simplified approach - in production you'd have proper participant-to-producer mapping
    // For now, we'll return all active producers and assume they belong to the participants
    const allProducers = Array.from(this.producers.values());
    
    participantIds.forEach((participantId, index) => {
      // Simple distribution - each participant gets their producers
      // In a real implementation, you'd track which producers belong to which participant
      const participantProducers = allProducers.filter((_, i) => i % participantIds.length === index);
      result.push({
        participantId,
        producers: participantProducers
      });
    });

    return result;
  }

  /**
   * Restart HLS stream for better performance (handles buffering issues)
   */
  async restartHLSStream(roomId: string): Promise<IHLSStreamInfo | undefined> {
    try {
      this.logger.log(`🔄 Restarting HLS stream for room: ${roomId}`);
      
      const hlsStream = this.hlsStreams.get(roomId);
      if (!hlsStream) {
        this.logger.warn(`No HLS stream found for room: ${roomId}`);
        return undefined;
      }

      const participantIds = hlsStream.participantIds;
      
      // Stop current stream
      await this.stopHLSStream(roomId);
      
      // Wait a moment before restarting
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Start new stream
      const newStreamInfo = await this.startHLSStream(roomId, participantIds);
      
      this.logger.log(`✅ HLS stream restarted successfully for room: ${roomId}`);
      return newStreamInfo;
      
    } catch (error) {
      this.logger.error(`❌ Failed to restart HLS stream for room ${roomId}:`, error);
      return undefined;
    }
  }

  /**
   * Monitor HLS stream health and restart if needed
   */
  startHLSHealthMonitoring(roomId: string): void {
    const healthCheckInterval = setInterval(async () => {
      try {
        const hlsStream = this.hlsStreams.get(roomId);
        if (!hlsStream || !hlsStream.isActive) {
          clearInterval(healthCheckInterval);
          return;
        }

        const ffmpegProcess = this.ffmpegProcesses.get(roomId);
        if (!ffmpegProcess || ffmpegProcess.killed || ffmpegProcess.exitCode !== null) {
          this.logger.warn(`🚨 HLS FFmpeg process died for room ${roomId}, restarting...`);
          await this.restartHLSStream(roomId);
        }

      } catch (error) {
        this.logger.error(`❌ HLS health check failed for room ${roomId}:`, error);
      }
    }, 10000); // Check every 10 seconds

    // Store the interval reference for cleanup
    if (!this.hlsHealthChecks) {
      this.hlsHealthChecks = new Map();
    }
    this.hlsHealthChecks.set(roomId, healthCheckInterval);
  }

  private hlsHealthChecks: Map<string, NodeJS.Timeout> = new Map();
} 