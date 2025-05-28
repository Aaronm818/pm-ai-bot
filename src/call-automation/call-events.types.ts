import { CommunicationIdentifier } from '@azure/communication-common';
export { CommunicationIdentifier };

// Text-to-Speech Configuration
export interface TextToSpeechConfig {
  text: string;
  voice?: string;
  language?: string;
  waitTimeMs?: number;
}

export const DEFAULT_TTS_CONFIG: TextToSpeechConfig = {
  text: 'Hello, this is a test message from Azure Communication Services.',
  voice: 'en-US-JennyNeural',
  language: 'en-US',
  waitTimeMs: 3500,
};

export interface EventGridEvent {
  id: string;
  topic: string;
  subject: string;
  eventType: string;
  eventTime: string;
  data: any;
  dataVersion: string;
}

export interface AcsCallEventData {
  callConnectionId: string;
  serverCallId: string;
  correlationId: string;
  publicEventType: string;
}

export interface AcsIncomingCallEventData extends AcsCallEventData {
  callerDisplayName: string;
  incomingCallContext: string;
  to: CommunicationIdentifier;
  from: CommunicationIdentifier;
}

export interface AcsCallConnectedEventData extends AcsCallEventData {
  callConnectionState: 'connected' | 'disconnected';
}

export interface AcsCallDisconnectedEventData extends AcsCallEventData {
  callConnectionState: 'disconnected';
}

export interface AcsCallParticipantEventData extends AcsCallEventData {
  participants: CallParticipant[];
}

export interface CallParticipant {
  identifier: CommunicationIdentifier;
  isMuted: boolean;
}

// Media Streaming Event Data
export interface AcsMediaStreamingStartedEventData extends AcsCallEventData {
  mediaStreamingUpdate: {
    contentType: string;
    mediaStreamingStatus: 'Started' | 'Stopped';
    mediaStreamingStatusDetails: string;
  };
}

export interface AcsMediaStreamingStoppedEventData extends AcsCallEventData {
  mediaStreamingUpdate: {
    contentType: string;
    mediaStreamingStatus: 'Stopped';
    mediaStreamingStatusDetails: string;
  };
}

// DTMF Event Data
export interface AcsDtmfReceivedEventData extends AcsCallEventData {
  toneInfo: {
    sequenceId: number;
    tone: string;
  };
  callConnectionId: string;
}

// Play Completed Event Data
export interface AcsPlayCompletedEventData extends AcsCallEventData {
  resultInformation: {
    code: number;
    subCode: number;
    message: string;
  };
}

// Recording Event Data
export interface AcsRecordingFileStatusUpdatedEventData {
  recordingStorageInfo: {
    recordingChunks: RecordingChunk[];
  };
  recordingStartTime: string;
  recordingDurationMs: number;
  sessionEndReason: string;
}

export interface RecordingChunk {
  documentId: string;
  index: number;
  endReason: string;
  contentLocation: string;
  metadataLocation: string;
}

// Event Type Constants
export const ACS_EVENT_TYPES = {
  INCOMING_CALL: 'Microsoft.Communication.IncomingCall',
  CALL_CONNECTED: 'Microsoft.Communication.CallConnected',
  CALL_DISCONNECTED: 'Microsoft.Communication.CallDisconnected',
  PARTICIPANTS_UPDATED: 'Microsoft.Communication.ParticipantsUpdated',
  MEDIA_STREAMING_STARTED: 'Microsoft.Communication.MediaStreamingStarted',
  MEDIA_STREAMING_STOPPED: 'Microsoft.Communication.MediaStreamingStopped',
  DTMF_RECEIVED: 'Microsoft.Communication.DTMFReceived',
  PLAY_COMPLETED: 'Microsoft.Communication.PlayCompleted',
  PLAY_STARTED: 'Microsoft.Communication.PlayStarted',
  PLAY_FAILED: 'Microsoft.Communication.PlayFailed',
  PLAY_CANCELED: 'Microsoft.Communication.PlayCanceled',
  RECORDING_FILE_STATUS_UPDATED:
    'Microsoft.Communication.RecordingFileStatusUpdated',
  RECOGNIZE_COMPLETED: 'Microsoft.Communication.RecognizeCompleted',
  RECOGNIZE_FAILED: 'Microsoft.Communication.RecognizeFailed',
  RECOGNIZE_CANCELED: 'Microsoft.Communication.RecognizeCanceled',
  CONTINUOUS_DTMF_RECOGNITION_TONE_RECEIVED:
    'Microsoft.Communication.ContinuousDtmfRecognitionToneReceived',
  CONTINUOUS_DTMF_RECOGNITION_TONE_FAILED:
    'Microsoft.Communication.ContinuousDtmfRecognitionToneFailed',
  CONTINUOUS_DTMF_RECOGNITION_STOPPED:
    'Microsoft.Communication.ContinuousDtmfRecognitionStopped',
  SEND_DTMF_TONES_COMPLETED: 'Microsoft.Communication.SendDtmfTonesCompleted',
  SEND_DTMF_TONES_FAILED: 'Microsoft.Communication.SendDtmfTonesFailed',
  ADD_PARTICIPANT_SUCCEEDED: 'Microsoft.Communication.AddParticipantSucceeded',
  ADD_PARTICIPANT_FAILED: 'Microsoft.Communication.AddParticipantFailed',
  REMOVE_PARTICIPANT_SUCCEEDED:
    'Microsoft.Communication.RemoveParticipantSucceeded',
  REMOVE_PARTICIPANT_FAILED: 'Microsoft.Communication.RemoveParticipantFailed',
  CALL_TRANSFER_ACCEPTED: 'Microsoft.Communication.CallTransferAccepted',
  CALL_TRANSFER_FAILED: 'Microsoft.Communication.CallTransferFailed',
  RECORDING_STATE_CHANGED: 'Microsoft.Communication.RecordingStateChanged',
} as const;

// EventGrid System Events
export const EVENTGRID_EVENT_TYPES = {
  SUBSCRIPTION_VALIDATION: 'Microsoft.EventGrid.SubscriptionValidationEvent',
} as const;

export type AcsEventType =
  (typeof ACS_EVENT_TYPES)[keyof typeof ACS_EVENT_TYPES];
export type EventGridEventType =
  (typeof EVENTGRID_EVENT_TYPES)[keyof typeof EVENTGRID_EVENT_TYPES];

// EventGrid Subscription Validation Event
export interface SubscriptionValidationEventData {
  validationCode: string;
  validationUrl: string;
}

export interface SubscriptionValidationResponse {
  validationResponse: string;
}

// Call State Management
export interface CallSession {
  callConnectionId: string;
  serverCallId: string;
  correlationId: string;
  incomingCallContext?: string;
  state: 'incoming' | 'connected' | 'disconnected' | 'answered';
  startTime: Date;
  endTime?: Date;
  participants: CallParticipant[];
  from?: CommunicationIdentifier;
  to?: CommunicationIdentifier;
}

export interface DtmfToneConfig {
  tone: string;
  waitTimeMs: number;
}

export const DEFAULT_DTMF_CONFIG: DtmfToneConfig = {
  tone: '1',
  waitTimeMs: 2500,
};

export interface MediaStreamingConfig {
  transportUrl: string;
  transportType: 'websocket';
  contentType: 'audio';
  audioChannelType: 'mixed' | 'unmixed';
  startMediaStreaming: boolean;
  enableBidirectional: boolean;
  audioFormat: 'Pcm16KMono' | 'Pcm24KMono';
  startDelayMs: number;
}

export const DEFAULT_MEDIA_STREAMING_CONFIG: MediaStreamingConfig = {
  transportUrl: '',
  transportType: 'websocket',
  contentType: 'audio',
  audioChannelType: 'mixed',
  startMediaStreaming: false,
  enableBidirectional: true,
  audioFormat: 'Pcm24KMono',
  startDelayMs: 500,
};

export interface AudioStreamingSession {
  serverCallId: string;
  callConnectionId: string;
  isStreaming: boolean;
  startTime?: Date;
  endTime?: Date;
  recordingPath?: string;
}
