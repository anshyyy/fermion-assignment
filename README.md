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

- **Backend**: NestJS 10.x, TypeScript 5.x, MediaSoup 3.12.x
- **Real-time Communication**: Socket.IO 4.7.x, WebRTC
- **Frontend**: Vanilla JavaScript (embedded in HTML)
- **Security**: Helmet, CORS configuration
- **Code Quality**: ESLint, Prettier, strict TypeScript

## 📋 Prerequisites

- Node.js (version 18 or higher)
- npm (comes with Node.js)
- Git

## 🚀 Quick Start

### 1. Clone the Repository

```bash
git clone https://github.com/your-username/fermion-assignment.git
cd fermion-assignment
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Environment Configuration (Optional)

The application works out of the box with default configuration. For custom configuration, create a `.env` file in the root directory:

```env
# Application Configuration
NODE_ENV=development
PORT=3000

# MediaSoup Configuration
MEDIASOUP_LISTEN_IP=0.0.0.0
MEDIASOUP_ANNOUNCED_IP=127.0.0.1
MEDIASOUP_MIN_PORT=10000
MEDIASOUP_MAX_PORT=10100

# CORS Configuration
CORS_ORIGIN=http://localhost:3000
```

**Note**: All environment variables are optional and have sensible defaults.

### 4. Start the Application

```bash
# Development mode with hot reload
npm run start:dev

# Production build and start
npm run build
npm run start:prod

# Simple start
npm start
```

### 5. Access the Application

- **Streaming Interface**: http://localhost:3000/stream
- **Viewing Interface**: http://localhost:3000/watch
- **API Info**: http://localhost:3000/api/info
- **Health Check**: http://localhost:3000/health

## 🎯 Usage

### For Streamers

1. Navigate to `/stream`
2. Click "Start Streaming"
3. Allow camera access when prompted
4. Your stream is now live and viewers can watch

### For Viewers

1. Navigate to `/watch`
2. The page will automatically connect to any available stream
3. If no stream is active, you'll see a "No stream available" message

## 🔧 Configuration

### MediaSoup Configuration

The application uses MediaSoup for WebRTC infrastructure. Key configuration options in `src/config/mediasoup.config.ts`:

- **Workers**: Number of MediaSoup workers (default: CPU cores count)
- **RTC Ports**: Port range for WebRTC traffic (default: 10000-10100)
- **Codecs**: Supported audio/video codecs (VP8, VP9, H.264, Opus)

### Room Configuration

- **Max Viewers**: Maximum number of concurrent viewers per room (default: 100)
- **Session Cleanup**: Automatic cleanup of inactive sessions

## 📡 API Endpoints

### HTTP Endpoints

- `GET /` - Redirects to streaming page
- `GET /stream` - Streaming interface
- `GET /watch` - Viewing interface
- `GET /health` - Health check
- `GET /api/info` - API information

### WebSocket Events

#### Client to Server

- `join-room` - Join a streaming room
- `leave-room` - Leave a room
- `create-transport` - Create WebRTC transport
- `connect-transport` - Connect transport
- `produce` - Start media production (streaming)
- `consume` - Start media consumption (viewing)
- `resume-consumer` - Resume paused consumer

#### Server to Client

- `user-joined` - User joined room
- `user-left` - User left room
- `transport-created` - Transport created
- `producer-created` - Producer created
- `consumer-created` - Consumer created
- `stream-started` - Stream started
- `stream-ended` - Stream ended
- `viewer-count` - Current viewer count
- `error` - Error occurred

## 🛡️ Security Features

- **CORS Protection**: Configurable CORS origins
- **Helmet Security**: HTTP security headers with CSP configuration
- **Input Validation**: Request validation using class-validator
- **Type Safety**: Strict TypeScript enforcement

## 📊 Monitoring and Logging

The application includes comprehensive logging:

- **Connection Events**: Client connections and disconnections
- **Stream Events**: Stream start/stop events
- **Error Tracking**: Detailed error logging with context
- **Performance Metrics**: Room and user statistics

## 🔍 Development

### Available Scripts

```bash
# Development
npm run start:dev          # Start with hot reload
npm run start:debug        # Start with debug mode

# Building
npm run build              # Build for production

# Code Quality
npm run lint               # Run ESLint with auto-fix
npm run format             # Format code with Prettier

# Testing
npm run test               # Run unit tests
npm run test:watch         # Run tests in watch mode
npm run test:cov           # Run tests with coverage report
npm run test:debug         # Run tests in debug mode
npm run test:e2e           # Run end-to-end tests
```

### Project Structure

```
fermion-assignment/
├── public/                # Static assets (CSS, JS)
├── src/                   # Source code
│   ├── config/           # Configuration files
│   ├── modules/          # Feature modules
│   ├── types/            # TypeScript type definitions
│   └── *.ts              # Main application files
├── .eslintrc.js          # ESLint configuration
├── .prettierrc           # Prettier configuration
├── nest-cli.json         # NestJS CLI configuration
├── package.json          # Dependencies and scripts
└── tsconfig.json         # TypeScript configuration
```

## 🚀 Production Deployment

### Environment Variables for Production

```env
NODE_ENV=production
PORT=3000
MEDIASOUP_ANNOUNCED_IP=your-server-public-ip
CORS_ORIGIN=https://your-domain.com
```

### Manual Deployment

1. **Build the application**:
   ```bash
   npm run build
   ```

2. **Set environment variables**:
   ```bash
   export NODE_ENV=production
   export MEDIASOUP_ANNOUNCED_IP=your-server-ip
   ```

3. **Start the application**:
   ```bash
   npm run start:prod
   ```

### Port Configuration

Ensure the following ports are open:
- **HTTP/HTTPS**: 3000 (or your configured PORT)
- **WebRTC UDP**: 10000-10100 (or your configured range)

### Load Balancing

For high-traffic deployments:
- Use multiple MediaSoup workers (automatically configured based on CPU cores)
- Implement Redis for session storage if needed
- Use a load balancer with sticky sessions for WebSocket connections

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature-name`
3. Make your changes
4. Run linting and formatting: `npm run lint && npm run format`
5. Test your changes: `npm run test`
6. Commit your changes: `git commit -m 'Add feature'`
7. Push to the branch: `git push origin feature-name`
8. Submit a pull request

## 📝 License

This project is unlicensed. See the package.json file for more details.

## 🆘 Troubleshooting

### Common Issues

1. **Camera Access Denied**
   - Ensure you're using HTTPS in production
   - Check browser permissions for camera access
   - Try refreshing the page and allowing permissions

2. **Connection Issues**
   - Verify firewall settings allow UDP traffic on ports 10000-10100
   - Check `MEDIASOUP_ANNOUNCED_IP` is set to your server's public IP in production
   - Ensure WebSocket connections are not blocked

3. **High CPU Usage**
   - MediaSoup automatically creates workers based on CPU cores
   - Monitor the application logs for worker distribution
   - Consider reducing the number of concurrent connections

4. **Stream Not Appearing**
   - Check browser console for JavaScript errors
   - Verify MediaSoup transport creation in server logs
   - Ensure both streamer and viewer are in the same room

### Debug Mode

Enable debug logging by setting the log level in MediaSoup config:

```typescript
// In src/config/mediasoup.config.ts
logLevel: 'debug' as mediasoupTypes.WorkerLogLevel,
```

### Useful Commands

```bash
# Check application logs
npm run start:dev 2>&1 | grep -E "(error|warn|debug)"

# Test WebSocket connection
curl -X GET http://localhost:3000/health

# Check MediaSoup worker status
# Monitor console output when starting the application
```

## 📚 Additional Resources

- [MediaSoup Documentation](https://mediasoup.org/documentation/v3/)
- [NestJS Documentation](https://docs.nestjs.com/)
- [WebRTC Specifications](https://webrtc.org/getting-started/overview)
- [Socket.IO Documentation](https://socket.io/docs/v4/)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)

## 🔮 Future Enhancements

- [ ] Recording functionality
- [ ] Screen sharing support
- [ ] Chat integration
- [ ] User authentication and authorization
- [ ] Multiple room support
- [ ] Mobile app support
- [ ] Analytics dashboard
- [ ] Docker containerization
- [ ] Kubernetes deployment manifests

---

Built with ❤️ using NestJS and MediaSoup
