/**
 * PM AI Bot - WebRTC Audio Module
 * Direct connection to Azure OpenAI Realtime for lower latency audio
 * 
 * Usage:
 * 1. Include this script in your HTML
 * 2. Call initWebRTC(serverUrl) to get ephemeral token and connect
 * 3. WebRTC handles audio, WebSocket handles control messages
 */

// WebRTC State
let webrtcPeerConnection = null;
let webrtcDataChannel = null;
let webrtcAudioElement = null;
let webrtcMicTrack = null;
let webrtcConnected = false;
let webrtcEnabled = false;

// Track last assistant response item IDs for deletion on vision override
let lastAssistantItemIds = [];
let lastResponseId = null;

// Callbacks for integration with main app
let onWebRTCThinking = null;
let onWebRTCTranscript = null;
let onWebRTCResponse = null;
let onWebRTCError = null;
let onWebRTCConnected = null;
let onWebRTCDisconnected = null;

/**
 * Initialize WebRTC connection to Azure OpenAI Realtime
 * @param {string} serverUrl - Base URL of your NestJS server (e.g., http://localhost:3000)
 * @returns {Promise<boolean>} - True if connected successfully
 */
async function initWebRTC(serverUrl) {
    try {
        console.log('🚀 Initializing WebRTC connection...');
        
        // Step 1: Get ephemeral token from our server
        const tokenResponse = await fetch(`${serverUrl}/api/webrtc-token`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({})
        });

        if (!tokenResponse.ok) {
            throw new Error(`Token request failed: ${tokenResponse.status}`);
        }

        const tokenData = await tokenResponse.json();
        if (tokenData.error) {
            throw new Error(tokenData.error);
        }

        console.log('✅ Ephemeral token received');
        if (onWebRTCThinking) onWebRTCThinking('🔑 Ephemeral token received from server');

        // Step 2: Create RTCPeerConnection
        webrtcPeerConnection = new RTCPeerConnection();
        console.log('✅ RTCPeerConnection created');

        // Step 3: Set up audio playback
        webrtcAudioElement = document.createElement('audio');
        webrtcAudioElement.autoplay = true;
        document.body.appendChild(webrtcAudioElement);

        webrtcPeerConnection.ontrack = (event) => {
            console.log('🎵 Remote audio track received');
            if (event.streams.length > 0) {
                webrtcAudioElement.srcObject = event.streams[0];
                if (onWebRTCThinking) onWebRTCThinking('🔊 Audio stream connected');
            }
        };

        // Step 4: Get microphone access and add track
        if (onWebRTCThinking) onWebRTCThinking('🎤 Requesting microphone access...');
        const micStream = await navigator.mediaDevices.getUserMedia({ 
            audio: {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true
            } 
        });
        webrtcMicTrack = micStream.getAudioTracks()[0];
        webrtcPeerConnection.addTrack(webrtcMicTrack);
        console.log('✅ Microphone track added');

        // Step 5: Create data channel for events
        webrtcDataChannel = webrtcPeerConnection.createDataChannel('realtime-channel');
        
        webrtcDataChannel.onopen = () => {
            console.log('✅ WebRTC data channel open');
            webrtcConnected = true;
            if (onWebRTCConnected) onWebRTCConnected();
            if (onWebRTCThinking) onWebRTCThinking('✅ WebRTC connected - waiting for session...');
        };

        webrtcDataChannel.onmessage = handleWebRTCMessage;

        webrtcDataChannel.onclose = () => {
            console.log('❌ WebRTC data channel closed');
            webrtcConnected = false;
            if (onWebRTCDisconnected) onWebRTCDisconnected();
        };

        webrtcDataChannel.onerror = (error) => {
            console.error('WebRTC data channel error:', error);
            if (onWebRTCError) onWebRTCError(error.message || 'Data channel error');
        };

        // Connection state logging
        webrtcPeerConnection.onconnectionstatechange = () => {
            console.log('🔗 WebRTC connection state:', webrtcPeerConnection.connectionState);
            if (onWebRTCThinking) onWebRTCThinking(`🔗 Connection: ${webrtcPeerConnection.connectionState}`);
        };

        webrtcPeerConnection.oniceconnectionstatechange = () => {
            console.log('🧊 ICE state:', webrtcPeerConnection.iceConnectionState);
        };

        // Step 6: Create and send SDP offer
        if (onWebRTCThinking) onWebRTCThinking('🤝 Creating WebRTC offer...');
        const offer = await webrtcPeerConnection.createOffer();
        await webrtcPeerConnection.setLocalDescription(offer);

        // Step 7: Send SDP to Azure OpenAI
        if (onWebRTCThinking) onWebRTCThinking('📡 Connecting to Azure OpenAI Realtime...');
        const sdpResponse = await fetch(tokenData.webrtcUrl, {
            method: 'POST',
            body: offer.sdp,
            headers: {
                'Authorization': `Bearer ${tokenData.token}`,
                'Content-Type': 'application/sdp',
            },
        });

        if (!sdpResponse.ok) {
            throw new Error(`SDP exchange failed: ${sdpResponse.status}`);
        }

        const answerSdp = await sdpResponse.text();
        console.log('✅ SDP answer received');

        // Step 8: Set remote description
        const answer = { type: 'answer', sdp: answerSdp };
        await webrtcPeerConnection.setRemoteDescription(answer);
        console.log('✅ Remote description set - WebRTC connection establishing...');

        webrtcEnabled = true;
        return true;

    } catch (error) {
        console.error('WebRTC initialization error:', error);
        if (onWebRTCError) onWebRTCError(error.message);
        if (onWebRTCThinking) onWebRTCThinking(`❌ WebRTC error: ${error.message}`);
        return false;
    }
}

/**
 * Handle messages from Azure OpenAI Realtime via WebRTC data channel
 */
function handleWebRTCMessage(event) {
    try {
        const data = JSON.parse(event.data);
        console.log('📨 WebRTC message:', data.type);

        switch (data.type) {
            case 'session.created':
                console.log('🎉 WebRTC session created');
                // Note: Azure WebRTC does not support input_audio_transcription via session.update
                // Transcription of meeting audio is handled server-side via the WebSocket audio path
                if (onWebRTCThinking) onWebRTCThinking('🎉 AI session ready');
                break;

            case 'session.updated':
                console.log('✅ Session config updated:', data.session?.input_audio_transcription ? 'transcription ON' : 'no transcription');
                break;

            case 'input_audio_buffer.speech_started':
                console.log('🎤 Speech detected');
                if (onWebRTCThinking) onWebRTCThinking('🎤 Listening...');
                break;

            case 'input_audio_buffer.speech_stopped':
                console.log('🔇 Speech ended');
                if (onWebRTCThinking) onWebRTCThinking('🔇 Processing...');
                break;

            case 'conversation.item.input_audio_transcription.completed':
                console.log('📝 Transcript:', data.transcript);
                if (onWebRTCTranscript) onWebRTCTranscript(data.transcript, 'user');
                break;

            case 'response.created':
                // New response started - track its ID and reset item list
                lastResponseId = data.response?.id || null;
                lastAssistantItemIds = [];
                console.log('🆕 Response started:', lastResponseId);
                break;

            case 'response.output_item.added':
                // Track each output item so we can delete hallucinated ones
                if (data.item?.id) {
                    lastAssistantItemIds.push(data.item.id);
                    console.log('📎 Tracking response item:', data.item.id);
                }
                break;

            case 'response.output_audio_transcript.delta':
                // Partial transcript from AI
                break;

            case 'response.output_audio_transcript.done':
                console.log('🤖 AI transcript:', data.transcript);
                if (onWebRTCTranscript) onWebRTCTranscript(data.transcript, 'ai');
                break;

            case 'response.done':
                console.log('✅ AI response complete');
                // Capture any output item IDs we may have missed
                if (data.response?.output) {
                    for (const item of data.response.output) {
                        if (item.id && !lastAssistantItemIds.includes(item.id)) {
                            lastAssistantItemIds.push(item.id);
                        }
                    }
                }
                if (onWebRTCResponse) onWebRTCResponse(data);
                break;

            case 'error':
                console.error('WebRTC error:', data.error);
                if (onWebRTCError) onWebRTCError(data.error?.message || 'Unknown error');
                break;

            default:
                // Log other events for debugging
                if (!data.type.includes('delta')) {
                    console.log('WebRTC event:', data.type);
                }
        }
    } catch (error) {
        console.error('Error parsing WebRTC message:', error);
    }
}

/**
 * Send a text message via WebRTC data channel
 * @param {string} text - Text to send
 */
function sendWebRTCText(text) {
    if (!webrtcDataChannel || webrtcDataChannel.readyState !== 'open') {
        console.warn('WebRTC data channel not open');
        return false;
    }

    // Create conversation item
    const event = {
        type: 'conversation.item.create',
        item: {
            type: 'message',
            role: 'user',
            content: [{ type: 'input_text', text: text }]
        }
    };
    webrtcDataChannel.send(JSON.stringify(event));

    // Trigger response
    webrtcDataChannel.send(JSON.stringify({ type: 'response.create' }));
    
    return true;
}

/**
 * Inject context into the WebRTC session (for calendar, vision, etc.)
 * @param {string} context - Context text to inject
 */
function injectWebRTCContext(context) {
    if (!webrtcDataChannel || webrtcDataChannel.readyState !== 'open') {
        console.warn('WebRTC data channel not open');
        return false;
    }

    // Create context item
    const event = {
        type: 'conversation.item.create',
        item: {
            type: 'message',
            role: 'user',
            content: [{ 
                type: 'input_text', 
                text: `[CONTEXT DATA - Use this to answer the user's question]\n${context}` 
            }]
        }
    };
    webrtcDataChannel.send(JSON.stringify(event));

    // Trigger response
    webrtcDataChannel.send(JSON.stringify({ type: 'response.create' }));
    
    return true;
}

/**
 * Close WebRTC connection
 */
function closeWebRTC() {
    if (webrtcDataChannel) {
        webrtcDataChannel.close();
        webrtcDataChannel = null;
    }
    if (webrtcPeerConnection) {
        webrtcPeerConnection.close();
        webrtcPeerConnection = null;
    }
    if (webrtcMicTrack) {
        webrtcMicTrack.stop();
        webrtcMicTrack = null;
    }
    if (webrtcAudioElement) {
        webrtcAudioElement.remove();
        webrtcAudioElement = null;
    }
    webrtcConnected = false;
    webrtcEnabled = false;
    console.log('WebRTC connection closed');
}

/**
 * Check if WebRTC is connected
 */
function isWebRTCConnected() {
    return webrtcConnected && webrtcDataChannel?.readyState === 'open';
}

/**
 * Set callback functions for WebRTC events
 */
function setWebRTCCallbacks(callbacks) {
    if (callbacks.onThinking) onWebRTCThinking = callbacks.onThinking;
    if (callbacks.onTranscript) onWebRTCTranscript = callbacks.onTranscript;
    if (callbacks.onResponse) onWebRTCResponse = callbacks.onResponse;
    if (callbacks.onError) onWebRTCError = callbacks.onError;
    if (callbacks.onConnected) onWebRTCConnected = callbacks.onConnected;
    if (callbacks.onDisconnected) onWebRTCDisconnected = callbacks.onDisconnected;
}

// Export for use in main app
/**
 * Cancel the current AI response
 */
function cancelWebRTCResponse() {
    if (!webrtcDataChannel || webrtcDataChannel.readyState !== 'open') {
        console.warn('WebRTC data channel not open');
        return false;
    }
    console.log('🚫 Cancelling response and muting hallucinated audio...');

    // Immediately mute to stop hallucinated audio from playing
    if (webrtcAudioElement) {
        webrtcAudioElement.muted = true;
    }

    // Cancel the in-progress response
    webrtcDataChannel.send(JSON.stringify({ type: 'response.cancel' }));

    // Delete any hallucinated response items from the conversation
    // so they don't pollute context for the real vision response
    for (const itemId of lastAssistantItemIds) {
        console.log('🗑️ Deleting hallucinated item:', itemId);
        webrtcDataChannel.send(JSON.stringify({
            type: 'conversation.item.delete',
            item_id: itemId
        }));
    }
    lastAssistantItemIds = [];

    return true;
}

/**
 * Inject vision analysis and trigger response
 */
function injectVisionAndRespond(analysis, userQuestion) {
    if (!webrtcDataChannel || webrtcDataChannel.readyState !== 'open') {
        console.warn('WebRTC data channel not open');
        return false;
    }

    console.log('👁️ Injecting vision analysis and triggering response...');

    // Unmute audio so the real vision response can be heard
    if (webrtcAudioElement) {
        webrtcAudioElement.muted = false;
    }

    // Create context item with vision analysis
    const contextEvent = {
        type: 'conversation.item.create',
        item: {
            type: 'message',
            role: 'user',
            content: [{
                type: 'input_text',
                text: `[VISION ANALYSIS - This is what Claude Vision sees on the user's screen RIGHT NOW]\n\n${analysis}\n\nThe user asked: "${userQuestion}"\n\nIMPORTANT: Describe what is ACTUALLY on screen based on the vision analysis above. Do NOT make up or hallucinate content. Only describe what Claude Vision reported seeing.`
            }]
        }
    };
    webrtcDataChannel.send(JSON.stringify(contextEvent));

    // Trigger response
    webrtcDataChannel.send(JSON.stringify({ type: 'response.create' }));
    return true;
}

window.WebRTCAudio = {
    init: initWebRTC,
    sendText: sendWebRTCText,
    injectContext: injectWebRTCContext,
    injectVisionAndRespond: injectVisionAndRespond,
    cancelResponse: cancelWebRTCResponse,
    close: closeWebRTC,
    isConnected: isWebRTCConnected,
    setCallbacks: setWebRTCCallbacks
};
