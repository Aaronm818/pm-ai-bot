import { CommunicationIdentifier } from '@azure/communication-common';
export { CommunicationIdentifier };
export interface TextToSpeechConfig {
    text: string;
    voice?: string;
    language?: string;
    waitTimeMs?: number;
}
export declare const DEFAULT_TTS_CONFIG: TextToSpeechConfig;
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
export interface AcsDtmfReceivedEventData extends AcsCallEventData {
    toneInfo: {
        sequenceId: number;
        tone: string;
    };
    callConnectionId: string;
}
export interface AcsPlayCompletedEventData extends AcsCallEventData {
    resultInformation: {
        code: number;
        subCode: number;
        message: string;
    };
}
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
export declare const ACS_EVENT_TYPES: {
    readonly INCOMING_CALL: "Microsoft.Communication.IncomingCall";
    readonly CALL_CONNECTED: "Microsoft.Communication.CallConnected";
    readonly CALL_DISCONNECTED: "Microsoft.Communication.CallDisconnected";
    readonly PARTICIPANTS_UPDATED: "Microsoft.Communication.ParticipantsUpdated";
    readonly MEDIA_STREAMING_STARTED: "Microsoft.Communication.MediaStreamingStarted";
    readonly MEDIA_STREAMING_STOPPED: "Microsoft.Communication.MediaStreamingStopped";
    readonly DTMF_RECEIVED: "Microsoft.Communication.DTMFReceived";
    readonly PLAY_COMPLETED: "Microsoft.Communication.PlayCompleted";
    readonly PLAY_STARTED: "Microsoft.Communication.PlayStarted";
    readonly PLAY_FAILED: "Microsoft.Communication.PlayFailed";
    readonly PLAY_CANCELED: "Microsoft.Communication.PlayCanceled";
    readonly RECORDING_FILE_STATUS_UPDATED: "Microsoft.Communication.RecordingFileStatusUpdated";
    readonly RECOGNIZE_COMPLETED: "Microsoft.Communication.RecognizeCompleted";
    readonly RECOGNIZE_FAILED: "Microsoft.Communication.RecognizeFailed";
    readonly RECOGNIZE_CANCELED: "Microsoft.Communication.RecognizeCanceled";
    readonly CONTINUOUS_DTMF_RECOGNITION_TONE_RECEIVED: "Microsoft.Communication.ContinuousDtmfRecognitionToneReceived";
    readonly CONTINUOUS_DTMF_RECOGNITION_TONE_FAILED: "Microsoft.Communication.ContinuousDtmfRecognitionToneFailed";
    readonly CONTINUOUS_DTMF_RECOGNITION_STOPPED: "Microsoft.Communication.ContinuousDtmfRecognitionStopped";
    readonly SEND_DTMF_TONES_COMPLETED: "Microsoft.Communication.SendDtmfTonesCompleted";
    readonly SEND_DTMF_TONES_FAILED: "Microsoft.Communication.SendDtmfTonesFailed";
    readonly ADD_PARTICIPANT_SUCCEEDED: "Microsoft.Communication.AddParticipantSucceeded";
    readonly ADD_PARTICIPANT_FAILED: "Microsoft.Communication.AddParticipantFailed";
    readonly REMOVE_PARTICIPANT_SUCCEEDED: "Microsoft.Communication.RemoveParticipantSucceeded";
    readonly REMOVE_PARTICIPANT_FAILED: "Microsoft.Communication.RemoveParticipantFailed";
    readonly CALL_TRANSFER_ACCEPTED: "Microsoft.Communication.CallTransferAccepted";
    readonly CALL_TRANSFER_FAILED: "Microsoft.Communication.CallTransferFailed";
    readonly RECORDING_STATE_CHANGED: "Microsoft.Communication.RecordingStateChanged";
};
export declare const EVENTGRID_EVENT_TYPES: {
    readonly SUBSCRIPTION_VALIDATION: "Microsoft.EventGrid.SubscriptionValidationEvent";
};
export type AcsEventType = (typeof ACS_EVENT_TYPES)[keyof typeof ACS_EVENT_TYPES];
export type EventGridEventType = (typeof EVENTGRID_EVENT_TYPES)[keyof typeof EVENTGRID_EVENT_TYPES];
export interface SubscriptionValidationEventData {
    validationCode: string;
    validationUrl: string;
}
export interface SubscriptionValidationResponse {
    validationResponse: string;
}
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
export declare const DEFAULT_DTMF_CONFIG: DtmfToneConfig;
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
export declare const DEFAULT_MEDIA_STREAMING_CONFIG: MediaStreamingConfig;
export interface AudioStreamingSession {
    serverCallId: string;
    callConnectionId: string;
    isStreaming: boolean;
    startTime?: Date;
    endTime?: Date;
    recordingPath?: string;
}
