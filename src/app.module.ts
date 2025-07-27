import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';
import { WebRtcModule } from '@/modules/webrtc/webrtc.module';
import { StreamingModule } from '@/modules/streaming/streaming.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';

/**
 * Root application module that configures all other modules and global settings
 * 
 * This module:
 * - Configures environment variables and validation
 * - Sets up static file serving for frontend assets
 * - Imports WebRTC and Streaming modules
 * - Provides global application services
 */
@Module({
  imports: [
    // Configuration module for environment variables
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
      validationOptions: {
        allowUnknown: true,
        abortEarly: false,
      },
    }),
    
    // Serve static files for frontend (HTML, CSS, JS)
    ServeStaticModule.forRoot({
      rootPath: join(__dirname, '..', 'public'),
      exclude: ['/api*', '/socket.io*'],
    }),
    
    // WebRTC module for real-time communication
    WebRtcModule,
    
    // Streaming module for MediaSoup integration
    StreamingModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {} 