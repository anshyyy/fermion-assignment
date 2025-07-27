import { Module } from '@nestjs/common';
import { WebRtcGateway } from './webrtc.gateway';
import { StreamingModule } from '@/modules/streaming/streaming.module';

/**
 * WebRTC Module
 * 
 * This module handles real-time communication for the WebRTC streaming application.
 * It includes:
 * - WebSocket gateway for client communication
 * - Integration with streaming services
 * - Real-time event handling
 * 
 * The module imports StreamingModule to access MediaSoup and Room services,
 * following the Dependency Injection principle for loose coupling.
 */
@Module({
  imports: [StreamingModule],
  providers: [WebRtcGateway],
  exports: [WebRtcGateway],
})
export class WebRtcModule {} 