import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import * as mediasoup from 'mediasoup';
import { types as mediasoupTypes } from 'mediasoup';
import { v4 as uuidv4 } from 'uuid';
import { workerConfig, routerConfig, transportOptions } from '@/config/mediasoup.config';
import { ITransport, IProducer, IConsumer } from '@/types/webrtc.types';

/**
 * MediaSoup Service
 * 
 * This service manages MediaSoup workers, routers, and transports.
 * It follows the Singleton pattern to ensure only one instance manages
 * the MediaSoup infrastructure across the application.
 * 
 * Responsibilities:
 * - Initialize and manage MediaSoup workers
 * - Create and manage routers for streaming rooms
 * - Handle transport creation for producers and consumers
 * - Manage the lifecycle of MediaSoup resources
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
  
  // Configuration
  private readonly numWorkers = 4; // Number of workers to create
  private currentWorkerIndex = 0;

  /**
   * Initialize MediaSoup infrastructure when module starts
   */
  async onModuleInit(): Promise<void> {
    this.logger.log('🚀 Initializing MediaSoup service...');
    
    try {
      await this.createWorkers();
      await this.createDefaultRouter();
      
      this.logger.log('✅ MediaSoup service initialized successfully');
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
      // Close all consumers
      for (const consumer of this.consumers.values()) {
        consumer.close();
      }
      
      // Close all producers
      for (const producer of this.producers.values()) {
        producer.close();
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

      // Store the transport
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
      const transport = this.transports.get(transportId);
      if (!transport) {
        throw new Error(`Transport not found: ${transportId}`);
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
      const transport = this.transports.get(transportId);
      if (!transport) {
        throw new Error(`Transport not found: ${transportId}`);
      }

      if (transport.constructor.name !== 'WebRtcTransport') {
        throw new Error('Transport is not a WebRTC transport');
      }

      const webrtcTransport = transport as mediasoupTypes.WebRtcTransport;
      
      const producer = await webrtcTransport.produce({
        kind,
        rtpParameters,
      });

      // Store the producer
      this.producers.set(producer.id, producer);

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

      this.logger.debug(`📤 Created producer: ${producer.id} (${kind})`);
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
      const transport = this.transports.get(transportId);
      if (!transport) {
        throw new Error(`Transport not found: ${transportId}`);
      }

      const producer = this.producers.get(producerId);
      if (!producer) {
        throw new Error(`Producer not found: ${producerId}`);
      }

      if (transport.constructor.name !== 'WebRtcTransport') {
        throw new Error('Transport is not a WebRTC transport');
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
   * Log MediaSoup service information
   */
  private logMediaSoupInfo(): void {
    this.logger.log(`📊 MediaSoup Service Status:`);
    this.logger.log(`   Workers: ${this.workers.length}`);
    this.logger.log(`   Routers: ${this.routers.size}`);
    this.logger.log(`   Transports: ${this.transports.size}`);
    this.logger.log(`   Producers: ${this.producers.size}`);
    this.logger.log(`   Consumers: ${this.consumers.size}`);
  }
} 