import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { Logger } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';

/**
 * Bootstrap function to initialize and start the NestJS application
 * Sets up global configurations, security, and validation
 */
async function bootstrap(): Promise<void> {
  const logger = new Logger('Bootstrap');
  
  try {
    // Create the NestJS application instance with Express platform
    const app = await NestFactory.create<NestExpressApplication>(AppModule);
    
    // Serve static files from public directory
    app.useStaticAssets(join(__dirname, '..', 'public'), {
      prefix: '/public/',
    });
    
    // Get configuration service for environment variables
    const configService = app.get(ConfigService);
    const port = configService.get<number>('PORT', 3000);
    const corsOrigin = configService.get<string>('CORS_ORIGIN', 'http://localhost:3000');
    
    // Security middleware - helmet for setting various HTTP headers
    app.use(helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
          styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
          fontSrc: ["'self'", "https://fonts.gstatic.com"],
          mediaSrc: ["'self'", 'blob:', 'data:'],
          connectSrc: ["'self'", 'ws:', 'wss:', 'https://stun.l.google.com:19302', 'https://stun1.l.google.com:19302'],
        },
      },
    }));
    
    // CORS configuration for cross-origin requests
    app.enableCors({
      origin: corsOrigin,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
    });
    
    // Global validation pipe with transformation and whitelist
    app.useGlobalPipes(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
        validationError: {
          target: false,
          value: false,
        },
      }),
    );
    
    // Start the application
    await app.listen(port);
    
    logger.log(`🚀 Application is running on: http://localhost:${port}`);
    logger.log(`📡 WebRTC streaming endpoints available:`);
    logger.log(`   - Stream: http://localhost:${port}/stream`);
    logger.log(`   - Watch: http://localhost:${port}/watch`);
    
  } catch (error) {
    logger.error('❌ Failed to start application:', error);
    process.exit(1);
  }
}

// Start the application
bootstrap(); 