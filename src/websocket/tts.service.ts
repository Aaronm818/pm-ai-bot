import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Azure Native Neural TTS Service
 * 
 * IMPORTANT: This uses Microsoft's NATIVE Neural TTS - NOT OpenAI!
 * 
 * Why we switched:
 * - OpenAI's gpt-4o-mini-tts has KNOWN voice inconsistency bugs
 * - OpenAI Realtime S2S has voice pitch variation issues
 * - Azure's native Neural voices are STABLE and CONSISTENT
 * 
 * Setup Required:
 * 1. Add to .env file:
 *    AZURE_SPEECH_REGION=eastus          # Your Azure region (eastus, westus2, etc.)
 *    AZURE_SPEECH_KEY=your-speech-key    # From Azure Portal > Speech Service > Keys
 * 
 * 2. Or create a Speech Service resource in Azure Portal:
 *    - Search "Speech" in Azure Portal
 *    - Create a Speech service resource
 *    - Copy Key 1 and Region
 * 
 * Available voices: https://learn.microsoft.com/en-us/azure/ai-services/speech-service/language-support?tabs=tts
 */

// Azure Neural Voice - consistent, stable, professional
// Popular options:
// - en-US-GuyNeural (male, professional)
// - en-US-JennyNeural (female, friendly)
// - en-US-AriaNeural (female, versatile)
// - en-US-DavisNeural (male, casual)
const AZURE_VOICE = 'en-US-GuyNeural';

interface TTSResult {
  audioBase64: string;
  error?: string;
}

@Injectable()
export class TTSService {
  private readonly logger = new Logger(TTSService.name);
  private readonly region: string;
  private readonly subscriptionKey: string;
  private isConfigured: boolean = false;

  constructor(private readonly configService: ConfigService) {
    // Get Azure Speech configuration
    this.region = this.configService.get<string>('AZURE_SPEECH_REGION') || '';
    this.subscriptionKey = this.configService.get<string>('AZURE_SPEECH_KEY') || 
                           this.configService.get<string>('OPENAI_API_KEY') || '';

    // Validate configuration
    if (!this.region) {
      this.logger.error('❌ AZURE_SPEECH_REGION not set in .env file!');
      this.logger.error('   Add: AZURE_SPEECH_REGION=eastus (or your region)');
      this.logger.error('   Valid regions: eastus, westus, westus2, centralus, etc.');
    }

    if (!this.subscriptionKey) {
      this.logger.error('❌ AZURE_SPEECH_KEY not set in .env file!');
      this.logger.error('   Add: AZURE_SPEECH_KEY=your-key-from-azure-portal');
    }

    if (this.region && this.subscriptionKey) {
      this.isConfigured = true;
      this.logger.log(`✅ Azure Native Neural TTS initialized`);
      this.logger.log(`   Voice: ${AZURE_VOICE} (consistent!)`);
      this.logger.log(`   Region: ${this.region}`);
      this.logger.log(`   Endpoint: https://${this.region}.tts.speech.microsoft.com`);
    } else {
      this.logger.warn('⚠️ Azure Neural TTS NOT configured - voice will not work');
    }
  }

  /**
   * Convert text to speech using Azure NATIVE Neural TTS
   * Returns base64-encoded audio (PCM16, 24kHz, mono)
   * 
   * This is Microsoft's own TTS engine - NOT OpenAI!
   * Voices are stable and consistent across requests.
   */
  async textToSpeech(
    text: string,
    voice: string = AZURE_VOICE,
  ): Promise<TTSResult> {
    if (!this.isConfigured) {
      this.logger.error('Azure Neural TTS not configured - check .env file');
      this.logger.error('Required: AZURE_SPEECH_REGION and AZURE_SPEECH_KEY');
      return { audioBase64: '', error: 'TTS not configured - check server logs' };
    }

    // Always use the configured voice for consistency
    const actualVoice = AZURE_VOICE;

    try {
      this.logger.log(`🔊 Azure Neural TTS (${actualVoice}): "${text.substring(0, 50)}..." (${text.length} chars)`);

      // Azure Native TTS endpoint - NOT OpenAI!
      const ttsEndpoint = `https://${this.region}.tts.speech.microsoft.com/cognitiveservices/v1`;

      // SSML format for Azure Neural TTS
      const ssml = `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='en-US'>
  <voice name='${actualVoice}'>
    ${this.escapeXml(text)}
  </voice>
</speak>`;

      this.logger.debug(`TTS Endpoint: ${ttsEndpoint}`);

      const response = await fetch(ttsEndpoint, {
        method: 'POST',
        headers: {
          'Ocp-Apim-Subscription-Key': this.subscriptionKey,
          'Content-Type': 'application/ssml+xml',
          'X-Microsoft-OutputFormat': 'raw-24khz-16bit-mono-pcm',  // PCM16 @ 24kHz
          'User-Agent': 'PM-AI-Bot',
        },
        body: ssml,
      });

      if (!response.ok) {
        const errorText = await response.text();
        this.logger.error(`Azure TTS error: ${response.status} - ${errorText}`);
        
        // Provide helpful error messages
        if (response.status === 401) {
          this.logger.error('❌ Authentication failed!');
          this.logger.error('   Check AZURE_SPEECH_KEY is correct');
          this.logger.error('   Key should be from: Azure Portal > Speech Service > Keys and Endpoint');
        } else if (response.status === 404) {
          this.logger.error('❌ Endpoint not found!');
          this.logger.error(`   Current region: ${this.region}`);
          this.logger.error('   Valid regions: eastus, westus, westus2, centralus, northeurope, etc.');
        } else if (response.status === 400) {
          this.logger.error('❌ Bad request - check SSML format');
        }
        
        return { audioBase64: '', error: `TTS error: ${response.status}` };
      }

      const audioBuffer = await response.arrayBuffer();
      const audioBase64 = Buffer.from(audioBuffer).toString('base64');

      this.logger.log(`✅ Azure Neural TTS complete: ${audioBase64.length} bytes (voice: ${actualVoice})`);

      return { audioBase64 };
    } catch (error) {
      this.logger.error(`Azure TTS failed:`, error);
      return { audioBase64: '', error: error.message };
    }
  }

  /**
   * Escape XML special characters for SSML
   */
  private escapeXml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  /**
   * Stream text to speech in chunks for lower latency
   * Breaks text into sentences and converts each
   */
  async *streamTextToSpeech(
    text: string,
    voice: string = AZURE_VOICE,
  ): AsyncGenerator<string> {
    const sentences = this.splitIntoSentences(text);
    
    for (const sentence of sentences) {
      if (sentence.trim()) {
        const result = await this.textToSpeech(sentence, AZURE_VOICE);
        if (result.audioBase64 && !result.error) {
          yield result.audioBase64;
        }
      }
    }
  }

  /**
   * Split text into sentences for streaming TTS
   */
  private splitIntoSentences(text: string): string[] {
    const sentences = text.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [text];
    return sentences.map(s => s.trim()).filter(s => s.length > 0);
  }

  /**
   * Convert text to speech - sends whole text at once
   */
  async textToSpeechChunked(
    text: string,
    voice: string = AZURE_VOICE,
    onChunk: (audioBase64: string) => void,
  ): Promise<void> {
    this.logger.log(`🔊 Azure Neural TTS: Converting ${text.length} chars (voice: ${AZURE_VOICE})`);
    
    const result = await this.textToSpeech(text, AZURE_VOICE);
    if (result.audioBase64 && !result.error) {
      onChunk(result.audioBase64);
    }
  }

  /**
   * Get available Azure Neural voices for reference
   */
  static getAvailableVoices(): { name: string; gender: string; style: string }[] {
    return [
      { name: 'en-US-JennyNeural', gender: 'Female', style: 'Friendly, warm' },
      { name: 'en-US-GuyNeural', gender: 'Male', style: 'Professional, clear' },
      { name: 'en-US-AriaNeural', gender: 'Female', style: 'Professional, versatile' },
      { name: 'en-US-DavisNeural', gender: 'Male', style: 'Casual, friendly' },
      { name: 'en-US-JaneNeural', gender: 'Female', style: 'Calm, soothing' },
      { name: 'en-US-JasonNeural', gender: 'Male', style: 'Confident, authoritative' },
      { name: 'en-US-SaraNeural', gender: 'Female', style: 'Cheerful, youthful' },
      { name: 'en-US-TonyNeural', gender: 'Male', style: 'Friendly, conversational' },
      { name: 'en-US-NancyNeural', gender: 'Female', style: 'Warm, empathetic' },
      { name: 'en-US-BrandonNeural', gender: 'Male', style: 'Engaging, energetic' },
    ];
  }

  /**
   * Test the TTS configuration
   */
  async testConfiguration(): Promise<{ success: boolean; message: string }> {
    if (!this.isConfigured) {
      return { 
        success: false, 
        message: 'Not configured. Add AZURE_SPEECH_REGION and AZURE_SPEECH_KEY to .env' 
      };
    }

    try {
      const result = await this.textToSpeech('Test');
      if (result.audioBase64 && !result.error) {
        return { success: true, message: `Working! Voice: ${AZURE_VOICE}, Region: ${this.region}` };
      } else {
        return { success: false, message: result.error || 'Unknown error' };
      }
    } catch (error) {
      return { success: false, message: error.message };
    }
  }
}
