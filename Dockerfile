# Use Node.js LTS version
FROM node:20-alpine

# Install build dependencies for native modules (especially mediasoup)
RUN apk add --no-cache python3 make g++ py3-pip linux-headers

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install all dependencies (including dev dependencies needed for build)
RUN npm ci

# Copy source code
COPY . .

# Build the application
RUN npm run build

# Remove dev dependencies and reinstall only production dependencies
RUN npm ci --only=production && npm cache clean --force

# Clean up build dependencies to reduce image size
RUN apk del python3 make g++ py3-pip linux-headers

# Expose ports
# HTTP port
EXPOSE 3000
# MediaSoup RTC ports
EXPOSE 10000-10100/udp

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs
RUN adduser -S nestjs -u 1001

# Change ownership of the app directory
RUN chown -R nestjs:nodejs /app
USER nestjs

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3000/health || exit 1

# Start the application
CMD ["npm", "run", "start:prod"] 