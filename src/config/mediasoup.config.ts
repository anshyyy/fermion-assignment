import { types as mediasoupTypes } from 'mediasoup';
import { IWorkerConfig, IRouterConfig, ITransportOptions } from '@/types/webrtc.types';

/**
 * MediaSoup Configuration
 * This file contains all the configuration needed for MediaSoup server
 * Including worker settings, media codecs, and transport options
 */

/**
 * Worker configuration for MediaSoup
 * Controls logging and RTC port range
 */
export const workerConfig: IWorkerConfig = {
  logLevel: 'warn' as mediasoupTypes.WorkerLogLevel,
  logTags: [
    'info',
    'ice',
    'dtls',
    'rtp',
    'srtp',
    'rtcp',
    // 'rtx',
    // 'bwe',
    // 'score',
    // 'simulcast',
    // 'svc'
  ] as mediasoupTypes.WorkerLogTag[],
  rtcMinPort: parseInt(process.env.MEDIASOUP_MIN_PORT || '10000'),
  rtcMaxPort: parseInt(process.env.MEDIASOUP_MAX_PORT || '10100'),
};

/**
 * Router media codecs configuration
 * Defines supported audio and video codecs with their capabilities
 */
export const routerConfig: IRouterConfig = {
  mediaCodecs: [
    {
      kind: 'audio',
      mimeType: 'audio/opus',
      clockRate: 48000,
      channels: 2,
    },
    {
      kind: 'video',
      mimeType: 'video/VP8',
      clockRate: 90000,
      parameters: {
        'x-google-start-bitrate': 1000,
      },
    },
    {
      kind: 'video',
      mimeType: 'video/VP9',
      clockRate: 90000,
      parameters: {
        'profile-id': 2,
        'x-google-start-bitrate': 1000,
      },
    },
    {
      kind: 'video',
      mimeType: 'video/h264',
      clockRate: 90000,
      parameters: {
        'packetization-mode': 1,
        'profile-level-id': '4d0032',
        'level-asymmetry-allowed': 1,
        'x-google-start-bitrate': 1000,
      },
    },
    {
      kind: 'video',
      mimeType: 'video/h264',
      clockRate: 90000,
      parameters: {
        'packetization-mode': 1,
        'profile-level-id': '42e01f',
        'level-asymmetry-allowed': 1,
        'x-google-start-bitrate': 1000,
      },
    },
  ] as mediasoupTypes.RtpCodecCapability[],
};

/**
 * WebRTC transport configuration
 * Defines how transports should be created and configured
 */
export const transportOptions: ITransportOptions = {
  listenIps: [
    {
      ip: process.env.MEDIASOUP_LISTEN_IP || '0.0.0.0',
      announcedIp: process.env.MEDIASOUP_ANNOUNCED_IP || '127.0.0.1',
    },
  ] as mediasoupTypes.TransportListenIp[],
  enableUdp: true,
  enableTcp: true,
  preferUdp: true,
  initialAvailableOutgoingBitrate: 1000000,
};

/**
 * Default room settings
 */
export const defaultRoomConfig = {
  maxViewers: 100,
  allowedOrigins: ['*'],
  isPrivate: false,
};

/**
 * Producer options for different media types
 */
export const producerOptions = {
  // Video producer options
  video: {
    codecOptions: {
      videoGoogleStartBitrate: 1000,
    },
  },
  // Audio producer options
  audio: {
    codecOptions: {},
  },
};

/**
 * Consumer options
 */
export const consumerOptions = {
  enableRtx: true,
  enableSrtp: true,
  preferTcp: false,
};

/**
 * Get environment-specific configuration
 */
export function getEnvironmentConfig(): {
  isDevelopment: boolean;
  isProduction: boolean;
  logLevel: mediasoupTypes.WorkerLogLevel;
  announceIp: string;
} {
  const isDevelopment = process.env.NODE_ENV === 'development';
  const isProduction = process.env.NODE_ENV === 'production';
  
  return {
    isDevelopment,
    isProduction,
    logLevel: isDevelopment ? 'debug' : 'warn',
    announceIp: process.env.MEDIASOUP_ANNOUNCED_IP || (isDevelopment ? '127.0.0.1' : '0.0.0.0'),
  };
} 