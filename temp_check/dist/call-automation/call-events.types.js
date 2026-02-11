"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_MEDIA_STREAMING_CONFIG = exports.DEFAULT_DTMF_CONFIG = exports.EVENTGRID_EVENT_TYPES = exports.ACS_EVENT_TYPES = exports.DEFAULT_TTS_CONFIG = void 0;
exports.DEFAULT_TTS_CONFIG = {
    text: 'Hello, this is a test message from Azure Communication Services.',
    voice: 'en-US-JennyNeural',
    language: 'en-US',
    waitTimeMs: 3500,
};
exports.ACS_EVENT_TYPES = {
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
    RECORDING_FILE_STATUS_UPDATED: 'Microsoft.Communication.RecordingFileStatusUpdated',
    RECOGNIZE_COMPLETED: 'Microsoft.Communication.RecognizeCompleted',
    RECOGNIZE_FAILED: 'Microsoft.Communication.RecognizeFailed',
    RECOGNIZE_CANCELED: 'Microsoft.Communication.RecognizeCanceled',
    CONTINUOUS_DTMF_RECOGNITION_TONE_RECEIVED: 'Microsoft.Communication.ContinuousDtmfRecognitionToneReceived',
    CONTINUOUS_DTMF_RECOGNITION_TONE_FAILED: 'Microsoft.Communication.ContinuousDtmfRecognitionToneFailed',
    CONTINUOUS_DTMF_RECOGNITION_STOPPED: 'Microsoft.Communication.ContinuousDtmfRecognitionStopped',
    SEND_DTMF_TONES_COMPLETED: 'Microsoft.Communication.SendDtmfTonesCompleted',
    SEND_DTMF_TONES_FAILED: 'Microsoft.Communication.SendDtmfTonesFailed',
    ADD_PARTICIPANT_SUCCEEDED: 'Microsoft.Communication.AddParticipantSucceeded',
    ADD_PARTICIPANT_FAILED: 'Microsoft.Communication.AddParticipantFailed',
    REMOVE_PARTICIPANT_SUCCEEDED: 'Microsoft.Communication.RemoveParticipantSucceeded',
    REMOVE_PARTICIPANT_FAILED: 'Microsoft.Communication.RemoveParticipantFailed',
    CALL_TRANSFER_ACCEPTED: 'Microsoft.Communication.CallTransferAccepted',
    CALL_TRANSFER_FAILED: 'Microsoft.Communication.CallTransferFailed',
    RECORDING_STATE_CHANGED: 'Microsoft.Communication.RecordingStateChanged',
};
exports.EVENTGRID_EVENT_TYPES = {
    SUBSCRIPTION_VALIDATION: 'Microsoft.EventGrid.SubscriptionValidationEvent',
};
exports.DEFAULT_DTMF_CONFIG = {
    tone: '1',
    waitTimeMs: 2500,
};
exports.DEFAULT_MEDIA_STREAMING_CONFIG = {
    transportUrl: '',
    transportType: 'websocket',
    contentType: 'audio',
    audioChannelType: 'mixed',
    startMediaStreaming: false,
    enableBidirectional: true,
    audioFormat: 'Pcm24KMono',
    startDelayMs: 500,
};
//# sourceMappingURL=call-events.types.js.map