import { types as mediasoupTypes } from 'mediasoup';
import { IWorkerConfig, IRouterConfig, ITransportOptions } from '@/types/webrtc.types';
import { join } from 'path';

/**
 * MediaSoup Configuration
 * This file contains all the configuration needed for MediaSoup server
 * Including worker settings, media codecs, transport options, and HLS configuration
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
 * HLS Streaming Configuration
 * Defines settings for HLS stream generation and serving
 */
export const hlsConfig = {
  // Directory where HLS files will be stored
  outputDir: join(process.cwd(), 'public', 'hls'),
  
  // HLS segment settings (optimized for low latency)
  segmentDuration: 2, // seconds - reduced for lower latency
  playlistLength: 4, // number of segments in playlist - reduced for faster updates
  
  // FFmpeg settings for HLS conversion (optimized for real-time streaming)
  ffmpeg: {
    // Video encoding settings (optimized for low-latency)
    videoCodec: 'libx264',
    videoBitrate: '800k', // Reduced from 1500k for faster encoding
    videoFrameRate: 25, // Reduced from 30 for better real-time performance
    videoResolution: '960x540', // Reduced from 1280x720 for faster processing
    
    // Audio encoding settings
    audioCodec: 'aac',
    audioBitrate: '96k', // Reduced from 128k for lower processing load
    audioSampleRate: 48000,
    
    // HLS specific settings (optimized for low latency)
    hlsTime: 2, // Reduced from 4 seconds for faster segment generation
    hlsListSize: 4, // Reduced from 6 for lower memory usage
    hlsFlags: 'hls_time=2:hls_list_size=4:hls_flags=delete_segments+hls_playlist_type=event',
    
    // Additional encoding options (optimized for real-time)
    preset: 'veryfast', // Changed from ultrafast for better quality/speed balance
    tune: 'zerolatency',
    profile: 'baseline',
    
    // Stream composition settings
    composition: {
      width: 1280,
      height: 720,
      frameRate: 30,
      layout: 'grid', // 'grid' or 'sidebar' 
    }
  },
  
  // RTP settings for FFmpeg input
  rtp: {
    videoPort: 20000,
    audioPort: 20002,
    videoPayloadType: 96,
    audioPayloadType: 97,
    videoSsrc: 22222222,
    audioSsrc: 11111111,
  }
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