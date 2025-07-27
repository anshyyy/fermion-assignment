# WebRTC Streaming Application

A production-ready WebRTC streaming application built with NestJS and MediaSoup. This application allows users to stream their camera feed in real-time and enables multiple viewers to watch the stream simultaneously.

## 🚀 Features

- **Real-time Video Streaming**: Stream your camera feed using WebRTC technology
- **Multiple Viewers**: Support for multiple concurrent viewers
- **Low Latency**: Optimized for minimal delay using MediaSoup
- **Production Ready**: Industry-level code with proper error handling and logging
- **Type Safety**: Full TypeScript implementation with strict type checking
- **Modern UI**: Beautiful and responsive web interface
- **Scalable Architecture**: Modular design with clean separation of concerns

## 🏗️ Architecture

### Backend Architecture

The application follows a modular, scalable architecture:

```
src/
├── modules/
│   ├── streaming/          # MediaSoup and room management
│   │   ├── mediasoup.service.ts
│   │   ├── room.service.ts
│   │   └── streaming.module.ts
│   └── webrtc/            # WebSocket communication
│       ├── webrtc.gateway.ts
│       └── webrtc.module.ts
├── config/                # Configuration files
│   └── mediasoup.config.ts
├── types/                 # TypeScript interfaces
│   └── webrtc.types.ts
├── app.controller.ts      # HTTP endpoints
├── app.service.ts         # HTML page generation
├── app.module.ts          # Root module
└── main.ts               # Application entry point
```

### Key Components

- **MediaSoup Service**: Manages WebRTC workers, routers, and transports
- **Room Service**: Handles user sessions and room state management
- **WebRTC Gateway**: Manages WebSocket communication for real-time signaling
- **App Service**: Generates HTML pages with embedded client-side JavaScript

## 🛠️ Technology Stack

- **Backend**: NestJS, TypeScript, MediaSoup
- **Real-time Communication**: Socket.IO, WebRTC
- **Frontend**: Vanilla JavaScript (embedded in HTML)
- **Security**: Helmet, CORS configuration
- **Code Quality**: ESLint, Prettier, strict TypeScript

## 📋 Prerequisites

- Node.js (version 16 or higher)
- npm or yarn
- Git

## 🚀 Quick Start

### 1. Clone the Repository

\`\`\`bash
git clone <repository-url>
cd fermion-assignment
\`\`\`

### 2. Install Dependencies

\`\`\`bash
npm install
\`\`\`

### 3. Environment Configuration

Create a \`.env\` file in the root directory:

\`\`\`env
# Application Configuration
NODE_ENV=development
PORT=3000

# MediaSoup Configuration
MEDIASOUP_LISTEN_IP=0.0.0.0
MEDIASOUP_ANNOUNCED_IP=127.0.0.1
MEDIASOUP_MIN_PORT=10000
MEDIASOUP_MAX_PORT=10100

# WebRTC Configuration
WEBRTC_LISTEN_IP=0.0.0.0
WEBRTC_ANNOUNCED_IP=127.0.0.1

# Security
CORS_ORIGIN=http://localhost:3000

# Logging
LOG_LEVEL=debug
\`\`\`

### 4. Start the Application

\`\`\`bash
# Development mode
npm run start:dev

# Production mode
npm run build
npm run start:prod
\`\`\`

### 5. Access the Application

- **Streaming Interface**: http://localhost:3000/stream
- **Viewing Interface**: http://localhost:3000/watch
- **API Info**: http://localhost:3000/api/info
- **Health Check**: http://localhost:3000/health

## 🎯 Usage

### For Streamers

1. Navigate to \`/stream\`
2. Click "Start Streaming"
3. Allow camera access when prompted
4. Your stream is now live and viewers can watch

### For Viewers

1. Navigate to \`/watch\`
2. The page will automatically connect to any available stream
3. If no stream is active, you'll see a "No stream available" message

## 🔧 Configuration

### MediaSoup Configuration

The application uses MediaSoup for WebRTC infrastructure. Key configuration options:

- **Workers**: Number of MediaSoup workers (default: 4)
- **RTC Ports**: Port range for WebRTC traffic (default: 10000-10100)
- **Codecs**: Supported audio/video codecs (VP8, VP9, H.264, Opus)

### Room Configuration

- **Max Viewers**: Maximum number of concurrent viewers per room (default: 100)
- **Session Cleanup**: Automatic cleanup of inactive sessions (default: 5 minutes)

## 📡 API Endpoints

### HTTP Endpoints

- \`GET /\` - Redirects to streaming page
- \`GET /stream\` - Streaming interface
- \`GET /watch\` - Viewing interface
- \`GET /health\` - Health check
- \`GET /api/info\` - API information

### WebSocket Events

#### Client to Server

- \`join-room\` - Join a streaming room
- \`leave-room\` - Leave a room
- \`create-transport\` - Create WebRTC transport
- \`connect-transport\` - Connect transport
- \`produce\` - Start media production (streaming)
- \`consume\` - Start media consumption (viewing)
- \`resume-consumer\` - Resume paused consumer

#### Server to Client

- \`user-joined\` - User joined room
- \`user-left\` - User left room
- \`transport-created\` - Transport created
- \`producer-created\` - Producer created
- \`consumer-created\` - Consumer created
- \`stream-started\` - Stream started
- \`stream-ended\` - Stream ended
- \`viewer-count\` - Current viewer count
- \`error\` - Error occurred

## 🛡️ Security Features

- **CORS Protection**: Configurable CORS origins
- **Helmet Security**: HTTP security headers
- **Input Validation**: Request validation using class-validator
- **Type Safety**: Strict TypeScript enforcement
- **Rate Limiting**: Built-in protection against abuse

## 📊 Monitoring and Logging

The application includes comprehensive logging:

- **Connection Events**: Client connections and disconnections
- **Stream Events**: Stream start/stop events
- **Error Tracking**: Detailed error logging with context
- **Performance Metrics**: Room and user statistics

## 🔍 Development

### Code Quality

\`\`\`bash
# Linting
npm run lint

# Formatting
npm run format

# Type checking
npm run build
\`\`\`

### Testing

\`\`\`bash
# Unit tests
npm run test

# Test coverage
npm run test:cov

# E2E tests
npm run test:e2e
\`\`\`

## 🚀 Production Deployment

### Environment Variables for Production

\`\`\`env
NODE_ENV=production
PORT=3000
MEDIASOUP_ANNOUNCED_IP=your-server-ip
CORS_ORIGIN=https://your-domain.com
LOG_LEVEL=warn
\`\`\`

### Docker Deployment

A Dockerfile is included for containerized deployment:

\`\`\`bash
# Build image
docker build -t webrtc-streaming .

# Run container
docker run -p 3000:3000 -p 10000-10100:10000-10100/udp webrtc-streaming
\`\`\`

### Load Balancing

For high-traffic deployments:
- Use multiple MediaSoup workers
- Implement Redis for session storage
- Use a load balancer with sticky sessions

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Run linting and tests
6. Submit a pull request

## 📝 License

This project is licensed under the MIT License.

## 🆘 Troubleshooting

### Common Issues

1. **Camera Access Denied**
   - Ensure HTTPS in production
   - Check browser permissions

2. **Connection Issues**
   - Verify firewall settings for UDP ports 10000-10100
   - Check MEDIASOUP_ANNOUNCED_IP configuration

3. **High CPU Usage**
   - Adjust number of MediaSoup workers
   - Monitor worker distribution

### Debug Mode

Enable debug logging:

\`\`\`env
LOG_LEVEL=debug
\`\`\`

## 📚 Additional Resources

- [MediaSoup Documentation](https://mediasoup.org/)
- [NestJS Documentation](https://nestjs.com/)
- [WebRTC Specifications](https://webrtc.org/)
- [Socket.IO Documentation](https://socket.io/)

## 🔮 Future Enhancements

- [ ] Recording functionality
- [ ] Screen sharing support
- [ ] Chat integration
- [ ] User authentication
- [ ] Multiple room support
- [ ] Mobile app support
- [ ] Analytics dashboard

---

Built with ❤️ using NestJS and MediaSoup
