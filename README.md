# 🤖 Azure Communication Services Teams Recording Bot

<p align="center">
  <img src="https://img.shields.io/badge/Azure-Communication%20Services-blue?style=for-the-badge&logo=microsoft-azure" alt="Azure Communication Services" />
  <img src="https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript" />
  <img src="https://img.shields.io/badge/NestJS-E0234E?style=for-the-badge&logo=nestjs&logoColor=white" alt="NestJS" />
  <img src="https://img.shields.io/badge/WebSocket-010101?style=for-the-badge&logo=websocket&logoColor=white" alt="WebSocket" />
</p>

<p align="center">
  <strong>A modern, real-time Teams meeting recording bot powered by Azure Communication Services</strong>
</p>

---

## 🌟 Overview

This project demonstrates how to build an intelligent Teams meeting recording bot using **Azure Communication Services (ACS)**. The bot can automatically join Teams meetings, record high-quality audio streams, and provide interactive features like text-to-speech announcements.

Built with modern technologies including NestJS, TypeScript, and WebSockets, this example showcases best practices for developing communication applications on Azure.

## ✨ Key Features

- **🎙️ Automatic Meeting Recording**: Seamlessly joins Teams meetings and records audio in real-time
- **🔊 Speech-to-Speech Integration**: Powered by OpenAI Realtime API for natural voice conversations
- **📊 Real-time Dashboard**: Beautiful web interface for monitoring active calls and recordings
- **🌐 WebSocket Streaming**: Low-latency audio streaming and real-time event updates
- **📱 DTMF Support**: Interactive touch-tone responses during calls
- **🎧 High-Quality Audio**: 24kHz PCM audio recording with unmixed channel support
- **📈 Live Analytics**: Real-time statistics and call monitoring
- **🎨 Modern UI**: Dark/light theme support with responsive design

## 🏗️ Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│  Teams Meeting  │    │      ACS Bot    │    │   Dashboard     │
│                 │◄──►│                 │◄──►│                 │
│  • Audio Stream │    │  • Call Control │    │  • Live Stats   │
│  • Participants │    │  • Recording    │    │  • Audio Player │
│  • Events       │    │  • TTS/DTMF     │    │  • Controls     │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                              │
                              ▼
                    ┌─────────────────┐
                    │   WebSocket     │
                    │                 │
                    │  • Real-time    │
                    │  • Audio Data   │
                    │  • Events       │
                    └─────────────────┘
```

## 🚀 Quick Start

### Prerequisites

- **Node.js** 18+ and npm
- **Azure Communication Services** resource
- **OpenAI API key** (for TTS functionality)
- **Teams meeting** to test with

### 1. Clone the Repository

```bash
git clone https://github.com/Azure-Samples/acs-teams-recording.git
cd acs-teams-recording
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Configure Environment

Copy the example environment file and configure your settings:

```bash
cp .env.example .env
```

Edit `.env` with your Azure and OpenAI credentials:

```bash
# Azure Communication Services Configuration
ACS_CONNECTION_STRING=endpoint=https://your-acs-resource.communication.azure.com/;accesskey=your-access-key

# Optional: Display name for the bot when joining Teams meetings
ACS_DISPLAY_NAME=ACS Audio Recording Bot

# Base URL for webhook callbacks (update this for production deployment)
BASE_URL=http://localhost:3000

# OpenAI API Configuration for Text-to-Speech
OPENAI_API_KEY=sk-your-openai-api-key-here
OPENAI_TTS_ENDPOINT=https://your-cognitive-services-resource.cognitiveservices.azure.com/openai/deployments/gpt-4o-mini-tts/audio/speech?api-version=2025-03-01-preview

# Optional: Enable debug logging
DEBUG_TEAMS_CALLING=true
```

### 4. Expose Your Local Development Server

Since Azure Communication Services needs to send webhook events to your application, your local server must be accessible from the internet. Use Visual Studio Dev Tunnels to expose port 3000:

```bash
# Install Dev Tunnels (if not already installed)
# For macOS with Homebrew:
brew install --cask devtunnel

# Create and start a tunnel to port 3000
devtunnel create --allow-anonymous
devtunnel port create -p 3000
devtunnel host
```

Copy the public URL provided by devtunnel (e.g., `https://abc123.devtunnels.ms`) and update your `.env` file:

```bash
# Update BASE_URL with your devtunnel URL
BASE_URL=https://abc123.devtunnels.ms
```

> **💡 Important**: The devtunnel URL is required because Azure Communication Services needs to send EventGrid webhooks to your `/acs/events` endpoint from the internet.

### 5. Start the Application

```bash
# Development mode with hot reload
npm run start:dev

# Production mode
npm run start:prod
```

### 6. Access the Dashboard

Open your browser and navigate to:
- **Dashboard**: http://localhost:3000/dashboard.html
- **API Endpoints**: http://localhost:3000/acs/

## 📖 How It Works

### 1. **Incoming Call Handling**
When a Teams meeting invitation is sent to your ACS resource, the bot automatically:
- Receives the incoming call event via EventGrid webhook
- Answers the call and joins the meeting
- Sets up audio streaming configuration

### 2. **Audio Recording Process**
- Establishes WebSocket connection for real-time audio streaming
- Receives unmixed audio streams from meeting participants
- Processes and saves audio as WAV files in the `recordings/` directory
- Provides real-time feedback through the dashboard

### 3. **Interactive Features**
- **DTMF Tones**: Send touch-tone signals during calls
- **Text-to-Speech**: Convert text to natural speech using OpenAI TTS
- **Call Management**: Hang up, transfer, or manage call states

### 4. **Real-time Monitoring**
- WebSocket-powered dashboard for live updates
- Call statistics and participant information
- Audio session management and playback

## 🎯 Use Cases

This example is perfect for learning how to build:

- **📞 Call Center Solutions**: Automated call handling and recording
- **🎓 Meeting Assistants**: AI-powered meeting bots with transcription
- **📊 Compliance Recording**: Legal and regulatory call recording systems
- **🤝 Customer Support**: Automated support with TTS responses
- **📈 Analytics Platforms**: Real-time call analysis and monitoring

## 🛠️ Development

### Project Structure

```
src/
├── call-automation/          # ACS call handling and automation
│   ├── call-automation.service.ts
│   ├── call-automation.controller.ts
│   └── call-events.types.ts
├── websocket/               # Real-time communication
│   ├── websocket.gateway.ts
│   ├── audio-streaming.service.ts
│   └── websocket.service.ts
└── main.ts                  # Application entry point

public/
└── dashboard.html           # Real-time monitoring dashboard

recordings/                  # Audio recordings storage

# Docker & Deployment
Dockerfile                   # Multi-stage production Dockerfile
.dockerignore               # Optimized Docker build context
Makefile                    # Automated deployment commands
deployment.env              # ACR configuration
deployment.env.example      # Configuration template
```

### 🐳 Docker Configuration

The project includes a production-optimized Dockerfile with the following features:

#### Multi-Stage Build

```dockerfile
# Stage 1: Build stage (Node.js 22 Alpine)
FROM node:22-alpine AS builder
# Install dependencies and build application

# Stage 2: Production stage (Node.js 22 Alpine)
FROM node:22-alpine AS production
# Copy only production files and dependencies
```

#### Security Features

- **Non-root user**: Runs as `nestjs` user (UID 1001)
- **Minimal attack surface**: Alpine Linux base image
- **Proper signal handling**: Uses `dumb-init` for graceful shutdowns
- **File permissions**: Secure ownership and permissions

#### Performance Optimizations

- **Layer caching**: Optimized layer order for faster rebuilds
- **Production dependencies**: Only installs runtime dependencies
- **Clean builds**: Removes build artifacts and caches
- **Health checks**: Built-in container health monitoring

### Available Scripts

```bash
# Development
npm run start:dev           # Start with hot reload
npm run start:debug         # Start with debugging

# Production
npm run build              # Build for production
npm run start:prod         # Run production build

# Code Quality
npm run lint               # Run ESLint
npm run format             # Format code with Prettier
npm run test               # Run unit tests
npm run test:e2e           # Run end-to-end tests

# Docker & Deployment
make help                  # Show all deployment commands
make validate              # Validate ACR configuration
make build-and-push        # Build and push to Azure Container Registry
make dev-build             # Local development build
make run-local             # Build and run locally
```

### API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/acs/events` | EventGrid webhook for ACS events |
| `GET` | `/calls` | List active calls |
| `POST` | `/calls/{id}/tts` | Send text-to-speech |
| `POST` | `/calls/{id}/hangup` | Hang up call |
| `GET` | `/recordings` | List audio recordings |
| `GET` | `/ws` | WebSocket endpoint |

## 🎨 Dashboard Features

The included dashboard provides:

- **📊 Real-time Statistics**: Active calls, connected clients, audio sessions
- **📞 Call Management**: View active calls, send TTS, hang up calls
- **🎵 Audio Playback**: Listen to recorded audio files
- **📱 Interactive Controls**: Send DTMF tones, manage call states
- **🌙 Theme Support**: Beautiful dark and light modes
- **📈 Live Charts**: Visual representation of activity over time

## 🔧 Configuration Options

### Audio Streaming Settings

```typescript
const DEFAULT_MEDIA_STREAMING_CONFIG = {
  transportType: 'websocket',
  contentType: 'audio',
  audioChannelType: 'unmixed',    // Separate audio streams per participant
  enableBidirectional: true,      // Enable both sending and receiving audio
  audioFormat: 'Pcm24KMono',     // High-quality 24kHz mono audio
  startDelayMs: 500              // Delay before starting recording
};
```

### Text-to-Speech Configuration

```typescript
const DEFAULT_TTS_CONFIG = {
  text: 'Hello, this is a test message from Azure Communication Services.',
  voice: 'en-US-JennyNeural',    // OpenAI voice mapping
  language: 'en-US',
  waitTimeMs: 3500               // Wait time before starting recording
};
```

## 🚀 Deployment

This project includes production-ready Docker configuration and automated deployment tools for Azure.

### 🐳 Docker Container Registry (Recommended)

The project includes a multi-stage Dockerfile optimized for production deployment with multi-architecture support.

#### Quick Setup

1. **Configure your Azure Container Registry details**:

```bash
# Copy and edit the deployment configuration
cp deployment.env.example deployment.env

# Edit deployment.env with your ACR details
ACR_NAME=your-acr-name
ACR_LOGIN_SERVER=your-acr-name.azurecr.io
```

2. **Build and push to Azure Container Registry**:

```bash
# Make sure you're logged into Azure
az login

# Build and push multi-architecture image (AMD64 + ARM64)
make build-and-push
```

3. **Deploy to Azure Container Instances or App Service**:

```bash
# Example: Deploy to Azure Container Instances
az container create \
  --resource-group myResourceGroup \
  --name acs-teams-recording \
  --image your-acr-name.azurecr.io/acs-teams-recording:latest \
  --environment-variables \
    ACS_CONNECTION_STRING="$ACS_CONNECTION_STRING" \
    OPENAI_API_KEY="$OPENAI_API_KEY" \
    BASE_URL="https://your-container-instance.region.azurecontainer.io"
```

#### Available Make Commands

The included Makefile provides automated deployment workflows:

```bash
# Show all available commands
make help

# Validate your configuration
make validate

# Build and push multi-platform image (recommended)
make build-and-push

# Development commands
make dev-build          # Quick local build
make run-local          # Build and run locally
make clean              # Clean up build resources
```

#### Docker Features

- **Multi-stage build**: Optimized for smaller production images
- **Multi-architecture support**: AMD64 and ARM64 (Apple Silicon compatible)
- **Security**: Non-root user, proper file permissions
- **Health checks**: Built-in container health monitoring
- **Signal handling**: Proper graceful shutdown with dumb-init

### 🎛️ Environment Variables for Production

Set these environment variables in your deployment environment:

```bash
# Required: Azure Communication Services
ACS_CONNECTION_STRING=your-production-acs-connection-string

# Required: Public URL for webhooks
BASE_URL=https://your-app-name.azurewebsites.net

# Required: OpenAI Configuration
OPENAI_API_KEY=your-openai-api-key
OPENAI_TTS_ENDPOINT=your-openai-tts-endpoint

```

## 📚 Resources

- **[Azure Communication Services Documentation](https://docs.microsoft.com/azure/communication-services/)**
- **[Call Automation Overview](https://docs.microsoft.com/azure/communication-services/concepts/voice-video-calling/call-automation)**
- **[Teams Interoperability](https://docs.microsoft.com/azure/communication-services/concepts/teams-interop)**
- **[NestJS Documentation](https://docs.nestjs.com/)**
- **[OpenAI Text-to-Speech API](https://platform.openai.com/docs/guides/text-to-speech)**

## ❓ Frequently Asked Questions

### Q: How do I test the bot with a Teams meeting?

A: Create a Teams meeting and add your ACS resource's phone number or user ID as a participant. The bot will automatically join when the meeting starts.

### Q: Can I customize the audio quality?

A: Yes! Modify the `audioFormat` in the media streaming configuration. Options include `Pcm16KMono` and `Pcm24KMono`.

### Q: Is this production-ready?

A: This is a sample application for learning purposes. For production use, add proper error handling, authentication, and security measures.

### Q: Can I record video as well?

A: Currently, this example focuses on audio recording. Video recording would require additional ACS features and storage solutions.

### Q: I'm getting Docker build errors about missing public directory

A: Make sure the `public/` directory is not excluded in `.dockerignore`. The included `.dockerignore` has been optimized to include necessary files while excluding development artifacts.

### Q: The Makefile commands aren't working

A: Ensure you have:
- Docker with buildx support installed
- Azure CLI installed and logged in (`az login`)
- Proper values set in `deployment.env`
- Run `make validate` to check your configuration

### Q: How do I debug container issues?

A: Use these commands to troubleshoot:

```bash
# Build locally for testing
make dev-build

# Run container locally with logs
make run-local

# Check container health
docker ps
docker logs <container-id>
```

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙋‍♂️ Support

- **Issues**: [GitHub Issues](https://github.com/Azure-Samples/acs-teams-recording/issues)
- **Discussions**: [GitHub Discussions](https://github.com/Azure-Samples/acs-teams-recording/discussions)
- **Azure Support**: [Azure Communication Services Support](https://docs.microsoft.com/azure/communication-services/support)

---

<p align="center">
  <strong>Happy coding! 🚀</strong><br>
  Built with ❤️ by the Azure Communication Services team
</p>
