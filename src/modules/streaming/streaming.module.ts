import { Module } from '@nestjs/common';
import { MediaSoupService } from './mediasoup.service';
import { RoomService } from './room.service';

/**
 * Streaming Module
 * 
 * This module encapsulates all streaming-related functionality including:
 * - MediaSoup service for WebRTC infrastructure
 * - Room service for user session management
 * - Streaming configuration and utilities
 * 
 * The module follows the Single Responsibility Principle by grouping
 * related streaming services together while keeping them separate
 * from other application concerns.
 */
@Module({
  providers: [
    MediaSoupService,
    RoomService,
  ],
  exports: [
    MediaSoupService,
    RoomService,
  ],
})
export class StreamingModule {} 