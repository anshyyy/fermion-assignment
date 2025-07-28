import { Controller, Get, Post, Param, Res, Logger, NotFoundException } from '@nestjs/common';
import { Response } from 'express';
import { promises as fs } from 'fs';
import { join } from 'path';
import { AppService } from './app.service';
import { MediaSoupService } from '@/modules/streaming/mediasoup.service';
import { hlsConfig } from '@/config/mediasoup.config';

/**
 * Main application controller
 * Handles basic routes and HLS streaming endpoints
 */
@Controller()
export class AppController {
  private readonly logger = new Logger(AppController.name);

  constructor(
    private readonly appService: AppService,
    private readonly mediaSoupService: MediaSoupService,
  ) {}

  @Get()
  getHello(): string {
    return 'Fermion Assignment - WebRTC Streaming Server';
  }

  /**
   * Serve the stream page
   */
  @Get('stream')
  getStreamPage(@Res() res: Response): void {
    res.sendFile(join(__dirname, '..', 'public', 'stream.html'));
  }

  /**
   * Serve the watch page
   */
  @Get('watch')
  getWatchPage(@Res() res: Response): void {
    res.sendFile(join(__dirname, '..', 'public', 'watch.html'));
  }

  /**
   * Get all active HLS streams
   */
  @Get('api/streams')
  getActiveStreams() {
    try {
      const streams = this.mediaSoupService.getAllHLSStreams();
      return {
        success: true,
        streams,
        count: streams.length,
      };
    } catch (error) {
      this.logger.error('Error getting active streams:', error);
      return {
        success: false,
        error: 'Failed to get active streams',
        streams: [],
        count: 0,
      };
    }
  }

  /**
   * Get specific HLS stream info
   */
  @Get('api/streams/:streamId')
  getStreamInfo(@Param('streamId') streamId: string) {
    try {
      const streamInfo = this.mediaSoupService.getHLSStreamInfo(streamId);
      
      if (!streamInfo) {
        throw new NotFoundException(`Stream not found: ${streamId}`);
      }

      return {
        success: true,
        stream: streamInfo,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to get stream info';
      this.logger.error(`Error getting stream info for ${streamId}:`, error);
      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * Serve HLS playlist files (.m3u8)
   */
  @Get('hls/:streamId/playlist.m3u8')
  async getHLSPlaylist(
    @Param('streamId') streamId: string,
    @Res() res: Response,
  ): Promise<void> {
    try {
      const playlistPath = join(hlsConfig.outputDir, streamId, 'playlist.m3u8');
      
      // Check if file exists
      try {
        await fs.access(playlistPath);
      } catch {
        throw new NotFoundException(`HLS playlist not found for stream: ${streamId}`);
      }

      // Set appropriate headers for HLS
      res.set({
        'Content-Type': 'application/x-mpegURL',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Range',
      });

      // Send the playlist file
      res.sendFile(playlistPath);
      
      this.logger.debug(`📺 Served HLS playlist for stream: ${streamId}`);

    } catch (error) {
      this.logger.error(`Error serving HLS playlist for ${streamId}:`, error);
      
      if (error instanceof NotFoundException) {
        res.status(404).json({
          success: false,
          error: error.message,
        });
      } else {
        res.status(500).json({
          success: false,
          error: 'Failed to serve HLS playlist',
        });
      }
    }
  }

  /**
   * Serve HLS video segments (.ts files)
   */
  @Get('hls/:streamId/:filename')
  async getHLSSegment(
    @Param('streamId') streamId: string,
    @Param('filename') filename: string,
    @Res() res: Response,
  ): Promise<void> {
    try {
      // Validate filename to prevent directory traversal
      if (!filename.endsWith('.ts') || filename.includes('..') || filename.includes('/')) {
        throw new NotFoundException('Invalid segment filename');
      }

      const segmentPath = join(hlsConfig.outputDir, streamId, filename);
      
      // Check if file exists
      try {
        await fs.access(segmentPath);
      } catch {
        throw new NotFoundException(`HLS segment not found: ${filename}`);
      }

      // Set appropriate headers for video segments
      res.set({
        'Content-Type': 'video/mp2t',
        'Cache-Control': 'public, max-age=31536000', // Cache segments for 1 year
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Range',
      });

      // Send the segment file
      res.sendFile(segmentPath);
      
      this.logger.debug(`📺 Served HLS segment: ${filename} for stream: ${streamId}`);

    } catch (error) {
      this.logger.error(`Error serving HLS segment ${filename} for ${streamId}:`, error);
      
      if (error instanceof NotFoundException) {
        res.status(404).json({
          success: false,
          error: error.message,
        });
      } else {
        res.status(500).json({
          success: false,
          error: 'Failed to serve HLS segment',
        });
      }
    }
  }

  /**
   * Start HLS stream manually (for testing)
   */
  @Post('api/streams/:streamId/start')
  async startHLSStream(@Param('streamId') streamId: string) {
    try {
      const streamInfo = await this.mediaSoupService.startHLSStream(streamId, []);
      
      this.logger.log(`🎬 Started HLS stream via API: ${streamId}`);
      
      return {
        success: true,
        message: 'HLS stream started successfully',
        stream: streamInfo,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to start HLS stream';
      this.logger.error(`Error starting HLS stream ${streamId}:`, error);
      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * Stop HLS stream manually (for testing)
   */
  @Post('api/streams/:streamId/stop')
  async stopHLSStream(@Param('streamId') streamId: string) {
    try {
      await this.mediaSoupService.stopHLSStream(streamId);
      
      this.logger.log(`🛑 Stopped HLS stream via API: ${streamId}`);
      
      return {
        success: true,
        message: 'HLS stream stopped successfully',
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to stop HLS stream';
      this.logger.error(`Error stopping HLS stream ${streamId}:`, error);
      return {
        success: false,
        error: errorMessage,
      };
    }
  }
} 