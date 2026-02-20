import {
  WebSocketGateway as WSGateway,
  WebSocketServer,
  OnGatewayInit,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, WebSocket } from 'ws';
import { OpenAIRealtimeService } from './openai-realtime.service';
import { ClaudeService } from './claude.service';
import { TTSService } from './tts.service';
import { FileOutputService } from './file-output.service';
import { DataverseService } from './dataverse.service';

/**
 * WebSocket Gateway for PM AI Bot
 * 
 * Uses OpenAI Realtime API (gpt-realtime full model) for Speech-to-Speech
 * Uses native WebSocket (ws library)
 */

interface ClientSession {
  socket: WebSocket;
  serverCallId: string;
  realtimeConnected: boolean;
  meetingContext?: string;
  userName?: string;
  latestScreenshot?: string;
}

@WSGateway({
  cors: {
    origin: '*',
  },
})
export class WebSocketGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(WebSocketGateway.name);
  private clients: Map<string, ClientSession> = new Map();
  private clientIdCounter = 0;

  constructor(
    private readonly openAIRealtimeService: OpenAIRealtimeService,
    private readonly claudeService: ClaudeService,
    private readonly ttsService: TTSService,
    private readonly fileOutputService: FileOutputService,
    private readonly dataverseService: DataverseService,
  ) {}

  afterInit() {
    this.logger.log('✅ WebSocketGateway initialized');
    this.logger.log('   Voice Engine: OpenAI Realtime API (gpt-realtime full model)');
    this.logger.log('   Architecture: True S2S with wake word detection');

    // Wire up Claude to get cached Dataverse data
    this.claudeService.setCachedDataCallback(() => {
      return this.dataverseService.getCachedTasksSummary();
    });

    // Set up OpenAI Realtime callbacks
    this.setupRealtimeCallbacks();
  }

  private setupRealtimeCallbacks() {
    // Track S2S speaking state per session
    const s2sSpeakingState = new Map<string, boolean>();

    // Audio response callback - send S2S audio to client
    this.openAIRealtimeService.setAudioResponseCallback((serverCallId, audioBase64) => {
      const session = this.findSessionByServerCallId(serverCallId);
      if (session && session.socket.readyState === WebSocket.OPEN) {
        // Send speaking_state true when first audio arrives
        if (!s2sSpeakingState.get(serverCallId)) {
          s2sSpeakingState.set(serverCallId, true);
          this.sendToClient(session.socket, 'speaking_state', { isSpeaking: true });
        }
        
        this.sendToClient(session.socket, 'audio', {
          audio: audioBase64,
          source: 'S2S',
          format: 'pcm16',
          sampleRate: 24000,
        });
        this.logger.debug(`🔊 [S2S] Sent audio: ${audioBase64.length} bytes`);
      }
    });

    // Transcript callback - send transcripts to client
    this.openAIRealtimeService.setTranscriptCallback((serverCallId, text, isFinal) => {
      const session = this.findSessionByServerCallId(serverCallId);
      if (session && session.socket.readyState === WebSocket.OPEN) {
        this.sendToClient(session.socket, 'transcript', {
          text,
          isFinal,
          source: 'user',
        });
      }
    });

    // Vision context callback - return latest screenshot
    this.openAIRealtimeService.setVisionContextCallback((serverCallId) => {
      const session = this.findSessionByServerCallId(serverCallId);
      return session?.latestScreenshot || null;
    });

    // Thinking callback - sends activity status to client
    this.openAIRealtimeService.setThinkingCallback((serverCallId, message) => {
      const session = this.findSessionByServerCallId(serverCallId);
      if (session) this.sendToClient(session.socket, 'thinking', { message });
    });

    // Vision analysis callback - calls Claude to analyze screenshots
    this.openAIRealtimeService.setVisionAnalysisCallback(async (screenshotBase64, userQuestion) => {
      this.logger.log('👁️ Analyzing screenshot with Claude Vision...');
      const analysis = await this.claudeService.analyzeScreenshot(screenshotBase64, userQuestion);
      return analysis;
    });

    // Speaking state callback - also clears S2S state
    this.openAIRealtimeService.setSpeakingStateChangedCallback((serverCallId, isSpeaking) => {
      const session = this.findSessionByServerCallId(serverCallId);
      if (session && session.socket.readyState === WebSocket.OPEN) {
        // Clear S2S speaking state when AI stops speaking
        if (!isSpeaking) {
          s2sSpeakingState.set(serverCallId, false);
        }
        this.sendToClient(session.socket, 'speaking_state', { isSpeaking });
      }
    });

    // PM text response callback - for TTS fallback
    this.openAIRealtimeService.setPmTextResponseCallback(async (serverCallId, text) => {
      const session = this.findSessionByServerCallId(serverCallId);
      if (session && session.socket.readyState === WebSocket.OPEN) {
        this.sendToClient(session.socket, 'pm_response', { text, source: 'pm' });

        const ttsResult = await this.ttsService.textToSpeech(text);
        if (ttsResult.audioBase64 && !ttsResult.error) {
          this.sendToClient(session.socket, 'audio', {
            audio: ttsResult.audioBase64,
            source: 'TTS',
            format: 'pcm16',
            sampleRate: 24000,
          });
        }
      }
    });

    // Claude request callback
    this.openAIRealtimeService.setClaudeRequestCallback(async (serverCallId, transcript, visionContext) => {
      const session = this.findSessionByServerCallId(serverCallId);
      if (!session) return;

      this.logger.log(`🧠 Claude request: "${transcript}"`);

      try {
        const response = await this.claudeService.chat(serverCallId, transcript, visionContext || undefined);

        if (response.error) {
          this.logger.error(`Claude error: ${response.error}`);
          this.sendToClient(session.socket, 'error', { message: response.error, source: 'claude' });
          return;
        }

        this.sendToClient(session.socket, 'claude_response', { text: response.text, source: 'claude' });

        // Check if Claude generated a document
        if (response.document && response.document.content) {
          this.logger.log(`📄 Document generated by Claude: ${response.document.type}`);
          const filename = `${response.document.type}-${response.document.title.replace(/[^a-zA-Z0-9]/g, '-').substring(0, 30)}`;
          
          const savedFile = await this.fileOutputService.saveContent(
            serverCallId,
            response.document.content,
            filename,
            'md',
            response.document.type,
          );
          
          this.sendToClient(session.socket, 'file_saved', {
            filename: savedFile.filename,
            url: savedFile.url,
            documentType: savedFile.type,
            content: response.document.content,
          });
          this.logger.log(`📄 file_saved message sent to client: ${savedFile.filename}`);
        } else {
          // Regular response - check if it should be saved
          const analysis = this.fileOutputService.analyzeContent(transcript, response.text);
          if (analysis.shouldSave && analysis.suggestedFilename) {
            const savedFile = await this.fileOutputService.saveContent(
              serverCallId,
              response.text,
              analysis.suggestedFilename,
              analysis.fileExtension,
              analysis.contentType,
            );
            this.sendToClient(session.socket, 'file_saved', {
              filename: savedFile.filename,
              url: savedFile.url,
              documentType: savedFile.type,
            });
          }
        }

        const ttsResult = await this.ttsService.textToSpeech(response.text);
        if (ttsResult.audioBase64 && !ttsResult.error) {
          this.sendToClient(session.socket, 'audio', {
            audio: ttsResult.audioBase64,
            source: 'TTS',
            format: 'pcm16',
            sampleRate: 24000,
          });
        }
      } catch (error) {
        this.logger.error('Claude request failed:', error);
        this.sendToClient(session.socket, 'error', { message: `Claude error: ${error.message}`, source: 'claude' });
      }
    });

    // Silent document callback (PM generates document silently while speaking)
    this.openAIRealtimeService.setSilentDocumentCallback(async (serverCallId, transcript) => {
      const session = this.findSessionByServerCallId(serverCallId);
      if (!session) {
        this.logger.warn(`📄 No session found for serverCallId: ${serverCallId}`);
        return;
      }

      this.logger.log(`📄 Silent document request: "${transcript}"`);
      this.logger.log(`📄 Calling Claude for document generation...`);

      try {
        const response = await this.claudeService.chat(serverCallId, transcript, undefined);

        this.logger.log(`📄 Claude response received: text=${response.text?.length || 0} chars, document=${response.document ? 'yes' : 'no'}`);
        this.sendToClient(session.socket, 'thinking', { message: '✅ Claude generated document' });

        if (response.error) {
          this.logger.error('Document generation failed:', response.error);
          this.sendToClient(session.socket, 'error', { 
            message: `Document generation failed: ${response.error}`, 
            source: 'claude' 
          });
          return;
        }

        // Check if Claude generated a document (this is the expected path)
        if (response.document && response.document.content) {
          this.logger.log(`📄 Document generated: ${response.document.type} - ${response.document.title}`);
          const filename = `${response.document.type}-${response.document.title.replace(/[^a-zA-Z0-9]/g, '-').substring(0, 30)}`;
          
          this.sendToClient(session.socket, 'thinking', { message: '💾 Saving to local workspace...' });
          const savedFile = await this.fileOutputService.saveContent(
            serverCallId,
            response.document.content,
            filename,
            'md',
            response.document.type,
          );
          this.logger.log(`📄 File saved: ${savedFile.filename}`);
          
          this.sendToClient(session.socket, 'thinking', { message: '📁 Uploading to SharePoint via Power Automate...' });
          await this.openAIRealtimeService.saveDocumentToSharePoint(
            savedFile.filename,
            response.document.content
          );
          this.logger.log('📁 Document saved to SharePoint');
          this.sendToClient(session.socket, 'thinking', { message: '✅ Document saved to SharePoint' });
          
          this.sendToClient(session.socket, 'file_saved', {
            filename: savedFile.filename,
            url: savedFile.url,
            documentType: savedFile.type,
            content: response.document.content,
          });
          this.logger.log(`📄 file_saved message sent to client`);
        } else if (response.text) {
          // Fallback: Save the text response if no document
          this.logger.warn(`📄 No document object, saving text response instead`);
          const savedFile = await this.fileOutputService.saveContent(
            serverCallId,
            response.text,
            'Generated-Document',
            'md',
            'document',
          );
          
          this.sendToClient(session.socket, 'file_saved', {
            filename: savedFile.filename,
            url: savedFile.url,
            documentType: 'document',
            content: response.text,
          });
        } else {
          this.logger.error('No content returned from Claude');
        }
      } catch (error) {
        this.logger.error('Document generation failed:', error);
        this.sendToClient(session.socket, 'error', { 
          message: `Document generation error: ${error.message}`, 
          source: 'claude' 
        });
      }
      
      this.logger.log(`📄 Silent document callback completed`);
    });
  }

  private sendToClient(client: WebSocket, type: string, data: any) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify({ type, ...data }));
    }
  }

  private findSessionByServerCallId(serverCallId: string): ClientSession | undefined {
    for (const session of this.clients.values()) {
      if (session.serverCallId === serverCallId) {
        return session;
      }
    }
    return undefined;
  }

  private getClientId(client: WebSocket): string | undefined {
    for (const [id, session] of this.clients) {
      if (session.socket === client) {
        return id;
      }
    }
    return undefined;
  }

  handleConnection(client: WebSocket) {
    const clientId = `client-${++this.clientIdCounter}`;
    const serverCallId = `call-${clientId}-${Date.now()}`;
    
    this.logger.log(`Client connected: ${clientId}`);
    
    this.clients.set(clientId, {
      socket: client,
      serverCallId,
      realtimeConnected: false,
    });

    // Send connection confirmation
    this.sendToClient(client, 'connected', {
      clientId,
      serverCallId,
      engine: 'OpenAI Realtime (gpt-realtime)',
      message: 'Connected to PM AI Bot',
    });

    // Set up message handler
    client.on('message', (data: Buffer) => {
      try {
        const message = JSON.parse(data.toString());
        this.handleMessage(client, clientId, message);
      } catch (error) {
        this.logger.error('Failed to parse message:', error);
      }
    });
  }

  handleDisconnect(client: WebSocket) {
    const clientId = this.getClientId(client);
    if (clientId) {
      this.logger.log(`Client disconnected: ${clientId}`);
      const session = this.clients.get(clientId);
      if (session?.realtimeConnected) {
        this.openAIRealtimeService.endSession(session.serverCallId);
      }
      this.clients.delete(clientId);
    }
  }

  private async handleMessage(client: WebSocket, clientId: string, message: any) {
    const session = this.clients.get(clientId);
    if (!session) return;

    switch (message.type) {
      case 'start_session':
        await this.handleStartSession(session, message);
        break;
      case 'audio':
        this.handleAudio(session, message);
        break;
      case 'screenshot':
      case 'vision_frame':
        this.handleScreenshot(session, message);
        break;
      case 'stop_session':
        this.handleStopSession(session);
        break;
      case 'trigger_response':
        this.handleTriggerResponse(session);
        break;
      case 'request_vision_analysis':
        this.handleVisionAnalysisRequest(session, message);
        break;
      case 'save_screenshot':
        this.handleSaveScreenshot(session, message);
        break;
      default:
        this.logger.warn(`Unknown message type: ${message.type}`);
    }
  }

  private async handleStartSession(session: ClientSession, data: any) {
    this.logger.log(`Starting OpenAI Realtime session for ${session.serverCallId}`);

    session.meetingContext = data?.meetingContext;
    session.userName = data?.userName;

    try {
      const connected = await this.openAIRealtimeService.createSession(session.serverCallId);

      if (connected) {
        session.realtimeConnected = true;
        
        const dataverseData = this.dataverseService.getCachedTasks();
        
        this.sendToClient(session.socket, 'session_started', {
          serverCallId: session.serverCallId,
          engine: 'OpenAI Realtime (gpt-realtime)',
          message: 'S2S session active',
          dataverseRecords: dataverseData.count,
        });

        this.logger.log(`📊 Dataverse cache: ${dataverseData.count} tasks available`);
      } else {
        this.sendToClient(session.socket, 'error', {
          message: 'Failed to connect to OpenAI Realtime. Check OPENAI_ENDPOINT and OPENAI_API_KEY.',
          source: 'gateway',
        });
      }
    } catch (error) {
      this.logger.error('Failed to start session:', error);
      this.sendToClient(session.socket, 'error', {
        message: `Session start failed: ${error.message}`,
        source: 'gateway',
      });
    }
  }

  private handleAudio(session: ClientSession, data: any) {
    if (!session.realtimeConnected) return;
    const audioData = data.audio || data.data;
    if (audioData) {
      this.openAIRealtimeService.sendAudio(session.serverCallId, audioData);
    }
  }

  private handleScreenshot(session: ClientSession, data: any) {
    session.latestScreenshot = data.image;
    this.logger.debug('Screenshot received and stored');
  }

  private handleStopSession(session: ClientSession) {
    if (session.realtimeConnected) {
      this.openAIRealtimeService.endSession(session.serverCallId);
      session.realtimeConnected = false;
      this.sendToClient(session.socket, 'session_ended', { reason: 'User requested stop' });
    }
  }




  private handleTriggerResponse(session: ClientSession) {
    if (session.realtimeConnected) {
      this.openAIRealtimeService.triggerResponse(session.serverCallId);
    }
  }

  private async handleVisionAnalysisRequest(session: ClientSession, data: any) {
    const userQuestion = data.question || 'What do you see on this screen?';
    
    this.logger.log('Vision analysis requested: ' + userQuestion);
    
    if (!session.latestScreenshot) {
      this.logger.warn('No screenshot available for vision analysis');
      this.sendToClient(session.socket, 'vision_analysis_result', {
        success: false,
        error: 'No screenshot available',
        analysis: 'I cannot see your screen right now. Please make sure screen capture is active.'
      });
      return;
    }

    try {
      this.sendToClient(session.socket, 'thinking', { message: 'Analyzing screen with Claude Vision...' });
      
      const analysis = await this.claudeService.analyzeScreenshot(session.latestScreenshot, userQuestion);
      
      this.logger.log('Vision analysis complete: ' + analysis.substring(0, 100) + '...');
      this.sendToClient(session.socket, 'thinking', { message: 'Screen analysis complete' });
      
      this.sendToClient(session.socket, 'vision_analysis_result', {
        success: true,
        analysis: analysis,
        question: userQuestion
      });
    } catch (error) {
      this.logger.error('Vision analysis failed: ' + error.message);
      this.sendToClient(session.socket, 'vision_analysis_result', {
        success: false,
        error: error.message,
        analysis: 'I had trouble analyzing your screen. Please try again.'
      });
    }
  }
  private async handleSaveScreenshot(session: ClientSession, data: any) {
    const imageData = data.image || session.latestScreenshot;
    if (!imageData) {
      this.logger.warn('No screenshot available to save');
      this.sendToClient(session.socket, 'screenshot_saved', {
        success: false,
        error: 'No screenshot available. Make sure screen capture is active.',
      });
      return;
    }

    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const filename = `screenshot-${timestamp}`;

      this.sendToClient(session.socket, 'thinking', { message: '💾 Saving screenshot...' });

      // Save locally
      const savedFile = await this.fileOutputService.saveImage(
        session.serverCallId,
        imageData,
        filename,
      );
      this.logger.log(`📸 Screenshot saved locally: ${savedFile.filename}`);

      // Upload to SharePoint
      this.sendToClient(session.socket, 'thinking', { message: '📁 Uploading to SharePoint...' });
      await this.openAIRealtimeService.saveDocumentToSharePoint(
        savedFile.filename,
        imageData,
      );
      this.logger.log('📁 Screenshot uploaded to SharePoint');

      this.sendToClient(session.socket, 'screenshot_saved', {
        success: true,
        filename: savedFile.filename,
        url: savedFile.url,
        size: savedFile.size,
      });
    } catch (error) {
      this.logger.error('Screenshot save failed:', error);
      this.sendToClient(session.socket, 'screenshot_saved', {
        success: false,
        error: error.message,
      });
    }
  }

  // ============================================
  // ACS Compatibility Methods
  // ============================================

  getConnectedAcsClients(): string[] {
    return Array.from(this.clients.keys());
  }

  getAcsClientCount(): number {
    return this.clients.size;
  }

  getAudioSessionStats(): { clientId: string; connected: boolean }[] {
    const stats: { clientId: string; connected: boolean }[] = [];
    for (const [clientId, session] of this.clients) {
      stats.push({ clientId, connected: session.realtimeConnected });
    }
    return stats;
  }

  sendAudioToAcsClient(clientId: string, audioData: string): boolean {
    const session = this.clients.get(clientId);
    if (session) {
      this.sendToClient(session.socket, 'audio', {
        audio: audioData,
        source: 'S2S',
        format: 'pcm16',
        sampleRate: 24000,
      });
      return true;
    }
    return false;
  }

  stopAudioForAcsClient(clientId: string): boolean {
    const session = this.clients.get(clientId);
    if (session) {
      this.sendToClient(session.socket, 'audio_stopped', { reason: 'Server requested stop' });
      return true;
    }
    return false;
  }

  broadcastToAllClients(eventType: string, data: any) {
    for (const session of this.clients.values()) {
      this.sendToClient(session.socket, eventType, data);
    }
  }

  broadcastAudioData(audioData: string) {
    for (const session of this.clients.values()) {
      this.sendToClient(session.socket, 'audio', {
        audio: audioData,
        source: 'S2S',
        format: 'pcm16',
        sampleRate: 24000,
      });
    }
  }

  performCleanup() {
    for (const [clientId, session] of this.clients) {
      if (session.socket.readyState !== WebSocket.OPEN) {
        this.logger.log(`Cleaning up disconnected client: ${clientId}`);
        if (session.realtimeConnected) {
          this.openAIRealtimeService.endSession(session.serverCallId);
        }
        this.clients.delete(clientId);
      }
    }
  }
}
