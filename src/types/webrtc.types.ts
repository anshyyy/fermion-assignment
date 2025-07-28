import { types as mediasoupTypes } from 'mediasoup';

/**
 * WebRTC Connection State enum
 * Represents the various states a WebRTC connection can be in
 */
export enum ConnectionState {
  CONNECTING = 'connecting',
  CONNECTED = 'connected',
  FAILED = 'failed',
  DISCONNECTED = 'disconnected',
  CLOSED = 'closed',
}

/**
 * User role in the streaming session
 */
export enum UserRole {
  STREAMER = 'streamer',
  VIEWER = 'viewer',
  PARTICIPANT = 'participant', // For multi-participant conference rooms
}

/**
 * MediaSoup Transport Interface
 * Represents transport configuration for MediaSoup
 */
export interface ITransport {
  id: string;
  iceParameters: mediasoupTypes.IceParameters;
  iceCandidates: mediasoupTypes.IceCandidate[];
  dtlsParameters: mediasoupTypes.DtlsParameters;
  sctpParameters?: mediasoupTypes.SctpParameters;
}

/**
 * Producer Information Interface
 * Contains details about a media producer (camera/microphone)
 */
export interface IProducer {
  id: string;
  kind: mediasoupTypes.MediaKind;
  rtpParameters: mediasoupTypes.RtpParameters;
  type: string;
  producerId: string;
}

/**
 * Consumer Information Interface
 * Contains details about a media consumer (receiving stream)
 */
export interface IConsumer {
  id: string;
  producerId: string;
  kind: mediasoupTypes.MediaKind;
  rtpParameters: mediasoupTypes.RtpParameters;
  type: string;
  producerPaused: boolean;
}

/**
 * User Session Interface
 * Represents a connected user in the streaming session
 */
export interface IUserSession {
  id: string;
  socketId: string;
  role: UserRole;
  displayName?: string;
  connectionState: ConnectionState;
  transport?: ITransport;
  producers: IProducer[];
  consumers: IConsumer[];
  joinedAt: Date;
  lastActivity: Date;
}

/**
 * Room Configuration Interface
 * Contains settings for a streaming room
 */
export interface IRoomConfig {
  id: string;
  name: string;
  maxViewers: number;
  allowedOrigins: string[];
  isPrivate: boolean;
  streamerId?: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * WebRTC Offer/Answer Interface
 */
export interface IWebRTCOffer {
  type: 'offer' | 'answer';
  sdp: string;
}

/**
 * ICE Candidate Interface
 */
export interface IIceCandidate {
  candidate: string;
  sdpMLineIndex: number;
  sdpMid: string;
}

/**
 * Socket Event Types
 * Defines all socket.io events used in the application
 */
export enum SocketEvents {
  // Connection events
  JOIN_ROOM = 'join-room',
  LEAVE_ROOM = 'leave-room',
  USER_JOINED = 'user-joined',
  USER_LEFT = 'user-left',
  
  // Transport events
  CREATE_TRANSPORT = 'create-transport',
  CONNECT_TRANSPORT = 'connect-transport',
  TRANSPORT_CREATED = 'transport-created',
  
  // Producer events
  PRODUCE = 'produce',
  PRODUCER_CREATED = 'producer-created',
  NEW_PRODUCER = 'new-producer',
  PRODUCER_CLOSED = 'producer-closed',
  
  // Consumer events
  CONSUME = 'consume',
  CONSUMER_CREATED = 'consumer-created',
  RESUME_CONSUMER = 'resume-consumer',
  
  // Stream events
  STREAM_STARTED = 'stream-started',
  STREAM_ENDED = 'stream-ended',
  
  // Error events
  ERROR = 'error',
  ROOM_FULL = 'room-full',
  UNAUTHORIZED = 'unauthorized',
}

/**
 * MediaSoup Worker Configuration
 */
export interface IWorkerConfig {
  logLevel: mediasoupTypes.WorkerLogLevel;
  logTags: mediasoupTypes.WorkerLogTag[];
  rtcMinPort: number;
  rtcMaxPort: number;
}

/**
 * MediaSoup Router Configuration
 */
export interface IRouterConfig {
  mediaCodecs: mediasoupTypes.RtpCodecCapability[];
}

/**
 * WebRTC Transport Options
 */
export interface ITransportOptions {
  listenIps: mediasoupTypes.TransportListenIp[];
  enableUdp: boolean;
  enableTcp: boolean;
  preferUdp: boolean;
  initialAvailableOutgoingBitrate?: number;
}

/**
 * HLS Stream Configuration
 * Defines settings for HLS stream generation
 */
export interface IHLSStreamConfig {
  streamId: string;
  outputPath: string;
  participantIds: string[];
  isActive: boolean;
  startedAt: Date;
  segmentDuration: number;
  playlistLength: number;
}

/**
 * HLS Stream Info
 * Contains information about an active HLS stream
 */
export interface IHLSStreamInfo {
  streamId: string;
  playlistUrl: string;
  participantCount: number;
  isLive: boolean;
  startedAt: Date;
  duration: number;
}

/**
 * Plain Transport Info
 * Contains information about MediaSoup plain transport for HLS
 */
export interface IPlainTransportInfo {
  id: string;
  ip: string;
  port: number;
  rtcpPort?: number;
  srtpParameters?: mediasoupTypes.SrtpParameters;
}

/**
 * Stream Composition Layout
 * Defines how multiple participant streams are composed
 */
export enum StreamLayout {
  GRID = 'grid',
  SIDEBAR = 'sidebar',
  SPOTLIGHT = 'spotlight',
  PICTURE_IN_PICTURE = 'pip',
}

/**
 * Participant Stream Info
 * Information about a participant's stream for composition
 */
export interface IParticipantStreamInfo {
  participantId: string;
  displayName: string;
  role: UserRole;
  hasVideo: boolean;
  hasAudio: boolean;
  position?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
} 