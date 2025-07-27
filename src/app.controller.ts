import { Controller, Get, Res, Logger } from '@nestjs/common';
import { Response } from 'express';
import { AppService } from './app.service';

/**
 * Main application controller
 * Handles the primary routes for streaming and watching
 * Serves HTML pages with embedded JavaScript for WebRTC functionality
 */
@Controller()
export class AppController {
  private readonly logger = new Logger(AppController.name);

  constructor(private readonly appService: AppService) {}

  /**
   * Root endpoint - redirects to streaming page
   * GET /
   */
  @Get()
  getRoot(@Res() res: Response): void {
    this.logger.log('Root endpoint accessed, redirecting to /stream');
    res.redirect('/stream');
  }

  /**
   * Streaming endpoint - serves the broadcaster interface
   * GET /stream
   * This page allows users to start streaming their camera
   */
  @Get('stream')
  getStreamPage(@Res() res: Response): void {
    this.logger.log('Stream page requested');
    
    const streamPageHtml = this.appService.generateStreamPage();
    res.setHeader('Content-Type', 'text/html');
    res.send(streamPageHtml);
  }

  /**
   * Watching endpoint - serves the viewer interface
   * GET /watch
   * This page allows users to watch the ongoing stream
   */
  @Get('watch')
  getWatchPage(@Res() res: Response): void {
    this.logger.log('Watch page requested');
    
    const watchPageHtml = this.appService.generateWatchPage();
    res.setHeader('Content-Type', 'text/html');
    res.send(watchPageHtml);
  }

  /**
   * Health check endpoint
   * GET /health
   */
  @Get('health')
  getHealth(): { status: string; timestamp: string; uptime: number } {
    return {
      status: 'OK',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    };
  }

  /**
   * API information endpoint
   * GET /api/info
   */
  @Get('api/info')
  getApiInfo(): {
    name: string;
    version: string;
    description: string;
    endpoints: string[];
  } {
    return {
      name: 'WebRTC Streaming Server',
      version: '1.0.0',
      description: 'Real-time video streaming using WebRTC and MediaSoup',
      endpoints: [
        'GET / - Root (redirects to /stream)',
        'GET /stream - Broadcaster interface',
        'GET /watch - Viewer interface',
        'GET /health - Health check',
        'GET /api/info - API information',
        'WebSocket /socket.io - Real-time communication',
      ],
    };
  }
} 