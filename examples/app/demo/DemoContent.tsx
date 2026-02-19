'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useRealtimeSession } from '@classytic/realtime-agents';
import type { AgentConfig, HistoryEntry } from '@classytic/realtime-agents';
import {
  OpenAIAdapter,
  OPENAI_VOICES,
  OPENAI_REALTIME_MODELS,
  OPENAI_DEFAULT_MODEL,
  OPENAI_TRANSPORTS,
  OPENAI_DEFAULT_TRANSPORT,
} from '@classytic/realtime-agents/openai';
import {
  GeminiAdapter,
  GEMINI_VOICES,
  GEMINI_LIVE_MODELS,
  GEMINI_DEFAULT_MODEL,
  GEMINI_TRANSPORTS,
  GEMINI_DEFAULT_TRANSPORT,
} from '@classytic/realtime-agents/gemini';
import { useMediaManager } from '@classytic/react-stream';
import {
  ProviderToggle,
  StatusBar,
  Controls,
  TranscriptDisplay,
  UsagePanel,
  ToolCards,
  VoiceSelector,
  HistoryPanel,
  AudioVisualizer,
  CameraPreview,
  TransportToggle,
  ModelSelector,
} from './_shared/components';
import type { Provider } from './_shared/components';
import { demoTools, demoInstructions } from './_shared/tools';

// =============================================================================
// CREDENTIAL FETCH
// =============================================================================

async function fetchOpenAIKey(model?: string): Promise<string> {
  const url = model ? `/api/session?model=${encodeURIComponent(model)}` : '/api/session';
  const res = await fetch(url);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const msg = err?.error?.message || err?.error || `HTTP ${res.status}`;
    throw new Error(`OpenAI session failed: ${msg}`);
  }
  const data = await res.json();
  return data.client_secret?.value ?? data.value;
}

async function fetchGeminiKey(): Promise<string> {
  const res = await fetch('/api/gemini-session');
  if (!res.ok) throw new Error('Failed to fetch Gemini session key');
  const data = await res.json();
  if (!data.apiKey) throw new Error('GEMINI_API_KEY not configured on server');
  return data.apiKey;
}

// =============================================================================
// PROVIDER CONFIG
// =============================================================================

const PROVIDER_CONFIG = {
  openai: {
    voices: OPENAI_VOICES,
    defaultVoice: 'coral',
    models: OPENAI_REALTIME_MODELS,
    defaultModel: OPENAI_DEFAULT_MODEL,
    transports: OPENAI_TRANSPORTS,
    defaultTransport: OPENAI_DEFAULT_TRANSPORT,
  },
  gemini: {
    voices: GEMINI_VOICES,
    defaultVoice: 'Kore',
    models: GEMINI_LIVE_MODELS,
    defaultModel: GEMINI_DEFAULT_MODEL,
    transports: GEMINI_TRANSPORTS,
    defaultTransport: GEMINI_DEFAULT_TRANSPORT,
  },
} as const;

// =============================================================================
// MAIN DEMO
// =============================================================================

export default function DemoContent() {
  const [provider, setProvider] = useState<Provider>('openai');
  const [isMuted, setIsMuted] = useState(false);
  const [selectedVoice, setSelectedVoice] = useState<string>(PROVIDER_CONFIG.openai.defaultVoice);
  const [selectedModel, setSelectedModel] = useState<string>(PROVIDER_CONFIG.openai.defaultModel);
  const [selectedTransport, setSelectedTransport] = useState<string>(PROVIDER_CONFIG.openai.defaultTransport);
  const [historyEntries, setHistoryEntries] = useState<HistoryEntry[]>([]);
  const [audioElement, setAudioElement] = useState<HTMLAudioElement | undefined>();

  const config = PROVIDER_CONFIG[provider];

  // ─── @classytic/react-stream — camera + mic for Gemini ───
  // Manages camera & mic independently so we get:
  //   • Camera preview visible BEFORE connecting
  //   • Input audio-level visualization
  //   • Device switching capability (useDeviceSwitch)
  //
  // Without react-stream the adapter handles getUserMedia internally:
  //   new GeminiAdapter({ enableVideo: true, ... })
  //   // Camera preview only after connecting via adapter.getMediaStream()
  const {
    cameraStream: rsCameraStream,
    microphone: rsMicrophone,
    camera: rsCamera,
    audioLevel,
    isSpeaking,
    initialize: initMedia,
    cleanup: cleanupMedia,
    toggleCamera,
  } = useMediaManager({
    videoConstraints: { width: 1280, height: 720 },
    audioConstraints: { echoCancellation: true, noiseSuppression: true },
  });

  // Initialize camera+mic when Gemini is selected, release on switch
  useEffect(() => {
    if (provider === 'gemini') {
      initMedia();
    } else {
      cleanupMedia();
    }
    return () => cleanupMedia();
  }, [provider, initMedia, cleanupMedia]);

  // Combine react-stream's separate audio+video streams into one for the adapter
  const rsMediaStream = useMemo(() => {
    if (provider !== 'gemini') return undefined;
    const micStream = rsMicrophone?.stream;
    if (!micStream && !rsCameraStream) return undefined;
    const combined = new MediaStream();
    micStream?.getAudioTracks().forEach((t) => combined.addTrack(t));
    rsCameraStream?.getVideoTracks().forEach((t) => combined.addTrack(t));
    return combined.getTracks().length > 0 ? combined : undefined;
  }, [provider, rsMicrophone?.stream, rsCameraStream]);

  // OpenAI WebRTC needs a hidden <audio> element for playback
  useEffect(() => {
    if (provider !== 'openai' || selectedTransport !== 'webrtc') {
      setAudioElement(undefined);
      return;
    }
    const el = document.createElement('audio');
    el.autoplay = true;
    el.style.display = 'none';
    document.body.appendChild(el);
    setAudioElement(el);
    return () => {
      if (document.body.contains(el)) document.body.removeChild(el);
    };
  }, [provider, selectedTransport]);

  // Adapter — recreated when provider, model, or transport changes
  const adapter = useMemo(() => {
    if (provider === 'gemini') {
      return new GeminiAdapter({
        model: selectedModel,
        inputTranscription: true,
        outputTranscription: true,
        // Video is managed by @classytic/react-stream (mediaStream passed to connect).
        // Without react-stream: set enableVideo: true here instead.
      });
    }
    return new OpenAIAdapter({
      model: selectedModel,
      transport: selectedTransport as 'webrtc' | 'websocket',
      codec: 'opus',
    });
  }, [provider, selectedModel, selectedTransport]);

  const {
    status,
    agentStatus,
    connect,
    disconnect,
    mute,
    interrupt,
    sendMessage,
    usage,
  } = useRealtimeSession(adapter, {
    onStatusChange: (s) => console.log(`[${provider}] Connection:`, s),
    onAgentStatusChange: (s) => console.log(`[${provider}] Agent:`, s),
    onError: (e) => console.error(`[${provider}] Error:`, e),
  });

  const isConnected = status === 'connected';

  // Switch provider — disconnect first, reset all provider-specific settings
  const handleProviderChange = useCallback(
    (p: Provider) => {
      if (isConnected) disconnect();
      setProvider(p);
      const cfg = PROVIDER_CONFIG[p];
      setSelectedVoice(cfg.defaultVoice);
      setSelectedModel(cfg.defaultModel);
      setSelectedTransport(cfg.defaultTransport);
      setIsMuted(false);
    },
    [isConnected, disconnect],
  );

  const agent = useMemo((): AgentConfig => ({
    name: provider === 'gemini' ? 'GeminiAssistant' : 'OpenAIAssistant',
    instructions: demoInstructions,
    tools: demoTools,
    voice: selectedVoice,
  }), [provider, selectedVoice]);

  const getCredentials = useCallback(async () => {
    if (provider === 'openai') return fetchOpenAIKey(selectedModel);
    return fetchGeminiKey();
  }, [provider, selectedModel]);

  const handleToggleConnection = useCallback(async () => {
    if (isConnected) {
      disconnect();
    } else {
      await connect({
        getCredentials,
        agent,
        audioElement,
        // @classytic/react-stream provides a combined audio+video MediaStream.
        // The adapter uses this instead of calling getUserMedia internally.
        // Without react-stream: omit mediaStream — the adapter manages its own.
        mediaStream: rsMediaStream,
        context: { demo: true, provider },
        history: historyEntries.length > 0 ? historyEntries : undefined,
      });
    }
  }, [isConnected, provider, getCredentials, agent, audioElement, rsMediaStream, historyEntries, connect, disconnect]);

  const handleToggleMute = useCallback(() => {
    const next = !isMuted;
    mute(next);
    setIsMuted(next);
  }, [isMuted, mute]);

  // ─── Output audio visualizer ───
  // The adapter exposes getOutputAnalyser() for all transports:
  // - WebSocket: AnalyserNode from the playback AudioContext
  // - WebRTC: AnalyserNode from the <audio> element's srcObject
  // - Gemini: AnalyserNode from the WebSocket playback context
  const [outputAnalyser, setOutputAnalyser] = useState<AnalyserNode | null>(null);

  useEffect(() => {
    if (!isConnected) {
      setOutputAnalyser(null);
      return;
    }
    // The adapter creates the WebRTC analyser asynchronously (polls srcObject),
    // so we poll getOutputAnalyser() until it's ready.
    const poll = setInterval(() => {
      const analyser = provider === 'gemini'
        ? (adapter as GeminiAdapter).getOutputAnalyser()
        : (adapter as OpenAIAdapter).getOutputAnalyser();
      if (analyser) {
        setOutputAnalyser(analyser);
        clearInterval(poll);
      }
    }, 300);
    // Also check immediately for WebSocket/Gemini which are ready synchronously
    const immediate = provider === 'gemini'
      ? (adapter as GeminiAdapter).getOutputAnalyser()
      : (adapter as OpenAIAdapter).getOutputAnalyser();
    if (immediate) {
      setOutputAnalyser(immediate);
      clearInterval(poll);
    }
    return () => {
      clearInterval(poll);
      setOutputAnalyser(null);
    };
  }, [isConnected, provider, adapter]);

  // ─── Input audio visualizer (mic) ───
  // Gemini: use react-stream's mic stream.
  // OpenAI: capture a separate mic stream for visualization only
  //         (WebRTC manages the actual mic internally).
  const [inputAnalyser, setInputAnalyser] = useState<AnalyserNode | null>(null);
  const inputCtxRef = useRef<AudioContext | null>(null);
  const inputStreamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    if (!isConnected) {
      cleanup();
      return;
    }

    // For Gemini, use react-stream's mic stream
    const micStream = provider === 'gemini' ? rsMicrophone?.stream : null;
    if (provider === 'gemini' && !micStream) {
      cleanup();
      return;
    }

    // For OpenAI, capture our own mic stream for visualization
    if (provider === 'openai') {
      navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      }).then((stream) => {
        inputStreamRef.current = stream;
        createAnalyser(stream);
      }).catch(() => { /* mic access denied — skip visualizer */ });
      return cleanup;
    }

    // Gemini path — micStream is already available
    createAnalyser(micStream!);
    return cleanup;

    function createAnalyser(stream: MediaStream) {
      const ctx = new AudioContext();
      ctx.resume();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      const source = ctx.createMediaStreamSource(stream);
      source.connect(analyser);
      inputCtxRef.current = ctx;
      setInputAnalyser(analyser);
    }

    function cleanup() {
      setInputAnalyser(null);
      if (inputCtxRef.current) {
        inputCtxRef.current.close();
        inputCtxRef.current = null;
      }
      if (inputStreamRef.current) {
        inputStreamRef.current.getTracks().forEach((t) => t.stop());
        inputStreamRef.current = null;
      }
    }
  }, [isConnected, provider, rsMicrophone?.stream]);

  // Video frame capture is handled inside GeminiAdapter automatically.
  // When the adapter's MediaStream has video tracks, it captures JPEG frames
  // every videoFrameInterval ms (default 5s) and sends them to the model.
  // Set videoFrameInterval: 0 to disable, then call adapter.sendImage() manually.

  // Current transport label for transcript header
  const transportLabel = config.transports.find((t: { id: string; name: string }) => t.id === selectedTransport)?.name ?? selectedTransport;

  return (
    <div className="min-h-screen bg-[#09090b] text-white">
      <main className="max-w-4xl mx-auto p-6">
        {/* Header */}
        <div className="text-center space-y-3 mb-6">
          <h1 className="text-2xl font-bold">Voice Agent Framework Demo</h1>
          <p className="text-zinc-400 text-sm">
            @classytic/realtime-agents — provider-agnostic realtime voice agents for React
          </p>
          <ProviderToggle
            value={provider}
            onChange={handleProviderChange}
            disabled={isConnected}
          />
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          {/* Left column: controls + features */}
          <div className="space-y-4">
            {/* Model + Transport + Voice selectors */}
            <div className="bg-zinc-900/50 rounded-lg border border-zinc-800 p-3 space-y-2.5">
              <ModelSelector
                models={config.models}
                value={selectedModel}
                onChange={setSelectedModel}
                disabled={isConnected}
              />
              <TransportToggle
                options={config.transports}
                value={selectedTransport}
                onChange={setSelectedTransport}
                disabled={isConnected}
              />
              <VoiceSelector
                voices={config.voices}
                value={selectedVoice}
                onChange={setSelectedVoice}
                disabled={isConnected}
              />
            </div>

            {/* Status */}
            <StatusBar status={status} agentStatus={agentStatus} />

            {/* Controls */}
            <Controls
              isConnected={isConnected}
              isConnecting={status === 'connecting'}
              isMuted={isMuted}
              onToggleConnection={handleToggleConnection}
              onToggleMute={handleToggleMute}
              onInterrupt={interrupt}
              onSendMessage={sendMessage}
            />

            {/* Camera preview + input level (Gemini, via @classytic/react-stream) */}
            {provider === 'gemini' && (
              <CameraPreview
                stream={rsCameraStream}
                audioLevel={audioLevel}
                isSpeaking={isSpeaking}
                cameraEnabled={rsCamera.trackEnabled}
                onToggleCamera={toggleCamera}
              />
            )}

            {/* Input audio visualizer (Gemini — AnalyserNode from react-stream mic) */}
            {inputAnalyser && <AudioVisualizer analyser={inputAnalyser} label="Mic Input" />}

            {/* Output audio visualizer */}
            {outputAnalyser && <AudioVisualizer analyser={outputAnalyser} label="AI Audio Output" />}

            {/* Usage */}
            <UsagePanel usage={usage} isConnected={isConnected} />

            {/* History injection */}
            <HistoryPanel
              entries={historyEntries}
              onChange={setHistoryEntries}
              disabled={isConnected}
            />

            {/* Tools */}
            <ToolCards tools={demoTools} />
          </div>

          {/* Right column: transcript */}
          <div className="bg-zinc-900/50 border border-zinc-800 rounded-lg overflow-hidden flex flex-col h-[600px]">
            <div className="border-b border-zinc-800 px-4 py-3 flex items-center justify-between">
              <h2 className="text-sm font-medium text-zinc-400">Conversation</h2>
              <span className="text-xs text-zinc-600">
                {transportLabel}
              </span>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              <TranscriptDisplay
                providerLabel={provider === 'openai' ? 'OpenAI' : 'Gemini'}
              />
            </div>
          </div>
        </div>

        {/* Footer */}
        <p className="text-xs text-zinc-600 text-center mt-6">
          Same <code className="text-zinc-500">useRealtimeSession</code> hook —
          just swap the adapter.
        </p>
      </main>
    </div>
  );
}
