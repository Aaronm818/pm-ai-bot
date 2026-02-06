# ==============================================
# PM AI Bot - Production Dockerfile
# Multi-stage build for minimal image size
# ==============================================

# Stage 1: Build
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files first (for better caching)
COPY package*.json ./

# Install all dependencies (including devDependencies for build)
RUN npm ci

# Copy source code
COPY . .

# Build the NestJS application
RUN npm run build

# ==============================================
# Stage 2: Production
FROM node:20-alpine AS production

# Add labels
LABEL maintainer="Aaron Magana"
LABEL application="PM AI Bot"
LABEL description="Concentrix PM AI Assistant with WebSocket support"

WORKDIR /app

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nestjs -u 1001

# Copy package files
COPY package*.json ./

# Install production dependencies only
RUN npm ci --only=production && \
    npm cache clean --force

# Copy built application from builder stage
COPY --from=builder /app/dist ./dist

# Copy public folder for static files
COPY --from=builder /app/public ./public

# Set ownership to non-root user
RUN chown -R nestjs:nodejs /app

# Switch to non-root user
USER nestjs

# Expose port (Azure App Service uses 8080 by default)
EXPOSE 8080

# Set environment variables
ENV NODE_ENV=production
ENV PORT=8080

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:8080/health || exit 1

# Start the application
CMD ["node", "dist/main.js"]
