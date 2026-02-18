'use client';

import { useRef, useEffect, useCallback, useState } from 'react';
import { useTranscript } from '@classytic/realtime-agents';
import type { UsageInfo, AgentStatus, SessionStatus, HistoryEntry } from '@classytic/realtime-agents';
import { Mic, MicOff, Phone, PhoneOff, Send, StopCircle, Plus, X } from 'lucide-react';

// =============================================================================
// PROVIDER TOGGLE
// =============================================================================

export type Provider = 'openai' | 'gemini';

export function ProviderToggle({
  value,
  onChange,
  disabled,
}: {
  value: Provider;
  onChange: (provider: Provider) => void;
  disabled: boolean;
}) {
  return (
    <div className="inline-flex rounded-lg bg-zinc-900 border border-zinc-800 p-1">
      {(['openai', 'gemini'] as const).map((p) => (
        <button
          key={p}
          onClick={() => onChange(p)}
          disabled={disabled && value !== p}
          className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
            value === p
              ? 'bg-zinc-700 text-white'
              : 'text-zinc-500 hover:text-zinc-300'
          } disabled:opacity-40 disabled:cursor-not-allowed`}
        >
          {p === 'openai' ? 'OpenAI' : 'Gemini'}
        </button>
      ))}
    </div>
  );
}

// =============================================================================
// HISTORY PANEL
// =============================================================================

export function HistoryPanel({
  entries,
  onChange,
  disabled,
}: {
  entries: HistoryEntry[];
  onChange: (entries: HistoryEntry[]) => void;
  disabled: boolean;
}) {
  const [role, setRole] = useState<'user' | 'assistant'>('user');
  const [text, setText] = useState('');

  const handleAdd = useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed) return;
    onChange([...entries, { role, text: trimmed }]);
    setText('');
  }, [entries, role, text, onChange]);

  const handleRemove = useCallback(
    (index: number) => {
      onChange(entries.filter((_, i) => i !== index));
    },
    [entries, onChange],
  );

  return (
    <div className="bg-zinc-900/50 rounded-lg border border-zinc-800 p-4">
      <h2 className="text-sm font-medium text-zinc-400 mb-2">
        Conversation History
        {entries.length > 0 && (
          <span className="text-zinc-600 text-xs ml-1">({entries.length} turns)</span>
        )}
      </h2>
      <p className="text-xs text-zinc-600 mb-3">
        Pre-seed the agent with previous conversation context before connecting.
      </p>

      {/* Existing entries */}
      {entries.length > 0 && (
        <div className="space-y-1.5 mb-3">
          {entries.map((entry, i) => (
            <div
              key={i}
              className={`flex items-start gap-2 text-xs rounded px-2 py-1.5 ${
                entry.role === 'user'
                  ? 'bg-blue-500/10 text-blue-300'
                  : 'bg-zinc-800 text-zinc-300'
              }`}
            >
              <span className="font-bold uppercase text-zinc-500 shrink-0 w-14">
                {entry.role === 'user' ? 'User' : 'AI'}
              </span>
              <span className="flex-1 break-words">{entry.text}</span>
              {!disabled && (
                <button
                  onClick={() => handleRemove(i)}
                  className="text-zinc-600 hover:text-red-400 shrink-0"
                >
                  <X size={14} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Add new entry */}
      {!disabled && (
        <div className="flex gap-2">
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as 'user' | 'assistant')}
            className="bg-zinc-900 border border-zinc-700 rounded px-2 py-1.5 text-xs text-zinc-300 shrink-0"
          >
            <option value="user">User</option>
            <option value="assistant">AI</option>
          </select>
          <input
            type="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
            placeholder="Add a conversation turn..."
            className="flex-1 bg-zinc-900 border border-zinc-700 rounded px-2 py-1.5 text-xs text-white placeholder:text-zinc-600 focus:outline-none focus:border-zinc-500"
          />
          <button
            onClick={handleAdd}
            disabled={!text.trim()}
            className="p-1.5 rounded bg-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            <Plus size={14} />
          </button>
        </div>
      )}
    </div>
  );
}

// =============================================================================
// STATUS BAR
// =============================================================================

const statusColors: Record<string, string> = {
  disconnected: 'bg-zinc-500',
  connecting: 'bg-yellow-500 animate-pulse',
  connected: 'bg-green-500',
};

const agentColors: Record<string, string> = {
  idle: 'text-zinc-400',
  listening: 'text-green-400',
  speaking: 'text-blue-400',
  thinking: 'text-yellow-400',
};

export function StatusBar({
  status,
  agentStatus,
}: {
  status: SessionStatus;
  agentStatus: AgentStatus;
}) {
  return (
    <div className="flex items-center justify-between bg-zinc-900/50 rounded-lg px-4 py-3 border border-zinc-800">
      <div className="flex items-center gap-2">
        <div className={`w-2.5 h-2.5 rounded-full ${statusColors[status] ?? 'bg-zinc-500'}`} />
        <span className="text-sm text-zinc-400 capitalize">{status}</span>
      </div>
      <span className={`text-sm font-medium capitalize ${agentColors[agentStatus] ?? 'text-zinc-400'}`}>
        {agentStatus}
      </span>
    </div>
  );
}

// =============================================================================
// CONTROLS
// =============================================================================

export function Controls({
  isConnected,
  isConnecting,
  isMuted,
  onToggleConnection,
  onToggleMute,
  onInterrupt,
  onSendMessage,
}: {
  isConnected: boolean;
  isConnecting: boolean;
  isMuted: boolean;
  onToggleConnection: () => void;
  onToggleMute: () => void;
  onInterrupt: () => void;
  onSendMessage: (text: string) => void;
}) {
  const [textInput, setTextInput] = useState('');

  const handleSendText = useCallback(() => {
    const trimmed = textInput.trim();
    if (trimmed) {
      onSendMessage(trimmed);
      setTextInput('');
    }
  }, [textInput, onSendMessage]);

  return (
    <div className="space-y-3">
      {/* Voice controls */}
      <div className="flex items-center justify-center gap-3">
        <button
          onClick={onToggleMute}
          disabled={!isConnected}
          className={`p-3 rounded-full transition-colors ${
            isMuted
              ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30'
              : 'bg-zinc-800 text-white hover:bg-zinc-700'
          } disabled:opacity-30 disabled:cursor-not-allowed`}
          title={isMuted ? 'Unmute' : 'Mute'}
        >
          {isMuted ? <MicOff size={20} /> : <Mic size={20} />}
        </button>

        <button
          onClick={onToggleConnection}
          disabled={isConnecting}
          className={`px-6 py-3 rounded-full font-medium transition-colors flex items-center gap-2 ${
            isConnected
              ? 'bg-red-500 hover:bg-red-600 text-white'
              : 'bg-green-500 hover:bg-green-600 text-white'
          } disabled:opacity-50`}
        >
          {isConnecting ? (
            <>
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Connecting...
            </>
          ) : isConnected ? (
            <>
              <PhoneOff size={18} />
              Disconnect
            </>
          ) : (
            <>
              <Phone size={18} />
              Connect
            </>
          )}
        </button>

        <button
          onClick={onInterrupt}
          disabled={!isConnected}
          className="p-3 rounded-full bg-zinc-800 text-white hover:bg-zinc-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          title="Interrupt"
        >
          <StopCircle size={20} />
        </button>
      </div>

      {/* Text input — send a text message while connected */}
      {isConnected && (
        <div className="flex gap-2">
          <input
            type="text"
            value={textInput}
            onChange={(e) => setTextInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSendText()}
            placeholder="Type a message..."
            className="flex-1 bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:border-zinc-500"
          />
          <button
            onClick={handleSendText}
            disabled={!textInput.trim()}
            className="p-2 rounded-lg bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            <Send size={18} />
          </button>
        </div>
      )}
    </div>
  );
}

// =============================================================================
// TRANSCRIPT DISPLAY
// =============================================================================

export function TranscriptDisplay({ providerLabel }: { providerLabel: string }) {
  const { transcriptItems } = useTranscript();
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [transcriptItems]);

  if (transcriptItems.length === 0) {
    return (
      <div className="text-zinc-500 text-sm text-center py-8">
        Conversation will appear here...
      </div>
    );
  }

  return (
    <div ref={scrollRef} className="space-y-3 max-h-[400px] overflow-y-auto">
      {transcriptItems.map((item, i) => {
        const isUser = item.role === 'user';
        const isBreadcrumb = item.type === 'BREADCRUMB';

        if (isBreadcrumb) {
          return (
            <div key={item.itemId ?? i} className="text-xs text-zinc-600 text-center py-1 font-mono">
              {item.title}
              {item.data && (
                <span className="ml-1 text-zinc-700">
                  {JSON.stringify(item.data)}
                </span>
              )}
            </div>
          );
        }

        return (
          <div
            key={item.itemId ?? i}
            className={`text-sm px-3 py-2 rounded-lg ${
              isUser
                ? 'bg-blue-500/10 text-blue-300 ml-8'
                : 'bg-zinc-800 text-zinc-300 mr-8'
            }`}
          >
            <span className="text-xs font-bold uppercase text-zinc-500 block mb-1">
              {isUser ? 'You' : providerLabel}
            </span>
            {item.title || (item.data ? JSON.stringify(item.data) : '...')}
          </div>
        );
      })}
    </div>
  );
}

// =============================================================================
// USAGE PANEL
// =============================================================================

export function UsagePanel({
  usage,
  isConnected,
}: {
  usage: UsageInfo | null;
  isConnected: boolean;
}) {
  if (!usage) return null;

  return (
    <div className="bg-zinc-900/50 rounded-lg border border-zinc-800 p-4">
      <h2 className="text-sm font-medium text-zinc-400 mb-2">
        Session Usage {isConnected && <span className="text-green-400 text-xs ml-1">(live)</span>}
      </h2>
      <div className="grid grid-cols-3 gap-4 text-center">
        <div>
          <div className="text-lg font-mono text-blue-400">
            {usage.inputTokens.toLocaleString()}
          </div>
          <div className="text-xs text-zinc-500">Input</div>
        </div>
        <div>
          <div className="text-lg font-mono text-green-400">
            {usage.outputTokens.toLocaleString()}
          </div>
          <div className="text-xs text-zinc-500">Output</div>
        </div>
        <div>
          <div className="text-lg font-mono text-white">
            {usage.totalTokens.toLocaleString()}
          </div>
          <div className="text-xs text-zinc-500">Total</div>
        </div>
      </div>

      {/* Token detail breakdown (for cost calculation) */}
      {(usage.inputTokensDetails || usage.outputTokensDetails) && (
        <div className="mt-3 pt-3 border-t border-zinc-800 text-xs text-zinc-600">
          {usage.inputTokensDetails && (
            <div className="flex flex-wrap gap-x-3">
              <span className="text-zinc-500">Input:</span>
              {Object.entries(usage.inputTokensDetails).map(([k, v]) => (
                <span key={k}>{k}: {v.toLocaleString()}</span>
              ))}
            </div>
          )}
          {usage.outputTokensDetails && (
            <div className="flex flex-wrap gap-x-3">
              <span className="text-zinc-500">Output:</span>
              {Object.entries(usage.outputTokensDetails).map(([k, v]) => (
                <span key={k}>{k}: {v.toLocaleString()}</span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// =============================================================================
// TOOL CARDS
// =============================================================================

const toolExamples: Record<string, string> = {
  getWeather: "What's the weather in Tokyo?",
  calculate: 'What is 25 times 4?',
  tellJoke: 'Tell me a joke',
  getCurrentTime: 'What time is it?',
};

export function ToolCards({ tools }: { tools: readonly { name: string; description: string }[] }) {
  return (
    <div className="bg-zinc-900/50 rounded-lg border border-zinc-800 p-4">
      <h2 className="text-sm font-medium text-zinc-400 mb-3">Available Tools</h2>
      <div className="space-y-2">
        {tools.map((t) => (
          <div key={t.name} className="flex items-start gap-2 text-xs">
            <code className="bg-blue-600/20 text-blue-400 px-1.5 py-0.5 rounded shrink-0">
              {t.name}
            </code>
            <div>
              <span className="text-zinc-400">{t.description}</span>
              {toolExamples[t.name] && (
                <span className="text-zinc-600 italic ml-1">
                  — &quot;{toolExamples[t.name]}&quot;
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// =============================================================================
// VOICE SELECTOR
// =============================================================================

export function VoiceSelector({
  voices,
  value,
  onChange,
  disabled,
}: {
  voices: readonly { id: string; name: string; description: string }[];
  value: string;
  onChange: (id: string) => void;
  disabled: boolean;
}) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="text-zinc-500">Voice:</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-zinc-300 disabled:opacity-50 text-xs"
      >
        {voices.map((v) => (
          <option key={v.id} value={v.id}>
            {v.name} — {v.description}
          </option>
        ))}
      </select>
    </div>
  );
}

// =============================================================================
// TRANSPORT TOGGLE (OpenAI: WebRTC / WebSocket)
// =============================================================================

export type TransportType = 'webrtc' | 'websocket';

export function TransportToggle({
  value,
  options,
  onChange,
  disabled,
}: {
  value: string;
  options: readonly { id: string; name: string; description: string }[];
  onChange: (transport: string) => void;
  disabled: boolean;
}) {
  if (options.length <= 1) return null;
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="text-zinc-500">Transport:</span>
      <div className="inline-flex rounded-md bg-zinc-900 border border-zinc-800 p-0.5">
        {options.map((t) => (
          <button
            key={t.id}
            onClick={() => onChange(t.id)}
            disabled={disabled && value !== t.id}
            title={t.description}
            className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
              value === t.id
                ? 'bg-zinc-700 text-white'
                : 'text-zinc-500 hover:text-zinc-300'
            } disabled:opacity-40 disabled:cursor-not-allowed`}
          >
            {t.name}
          </button>
        ))}
      </div>
    </div>
  );
}

// =============================================================================
// MODEL SELECTOR
// =============================================================================

export function ModelSelector({
  models,
  value,
  onChange,
  disabled,
}: {
  models: readonly { id: string; name: string; description: string }[];
  value: string;
  onChange: (id: string) => void;
  disabled: boolean;
}) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="text-zinc-500">Model:</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-zinc-300 disabled:opacity-50 text-xs"
      >
        {models.map((m) => (
          <option key={m.id} value={m.id}>
            {m.name} — {m.description}
          </option>
        ))}
      </select>
    </div>
  );
}

// =============================================================================
// CAMERA PREVIEW (Gemini video input)
// =============================================================================

export function CameraPreview({
  stream,
  audioLevel = 0,
  isSpeaking = false,
  cameraEnabled = true,
  onToggleCamera,
}: {
  stream: MediaStream | null;
  audioLevel?: number;
  isSpeaking?: boolean;
  cameraEnabled?: boolean;
  onToggleCamera?: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (!videoRef.current || !stream) return;
    videoRef.current.srcObject = stream;
    return () => {
      if (videoRef.current) videoRef.current.srcObject = null;
    };
  }, [stream]);

  return (
    <div className="bg-zinc-900/50 rounded-lg border border-zinc-800 p-3">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-xs font-medium text-zinc-500">Camera Input</h2>
        <div className="flex items-center gap-2">
          {stream && (
            <span className={`text-[10px] font-medium ${isSpeaking ? 'text-green-400' : 'text-zinc-600'}`}>
              {isSpeaking ? 'Speaking' : 'Silent'}
            </span>
          )}
          {onToggleCamera && (
            <button
              onClick={onToggleCamera}
              className={`text-[10px] px-2 py-0.5 rounded font-medium transition-colors ${
                cameraEnabled
                  ? 'bg-green-500/20 text-green-400 hover:bg-green-500/30'
                  : 'bg-zinc-700 text-zinc-400 hover:bg-zinc-600'
              }`}
            >
              {cameraEnabled ? 'Cam On' : 'Cam Off'}
            </button>
          )}
        </div>
      </div>
      {cameraEnabled && stream ? (
        <div className="relative">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="w-full rounded aspect-video object-cover bg-black"
          />
          {/* Input audio level — powered by @classytic/react-stream */}
          <div className="absolute bottom-2 left-2 right-2 h-1 bg-black/50 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-75 ${
                isSpeaking ? 'bg-green-400' : 'bg-zinc-500'
              }`}
              style={{ width: `${Math.min(audioLevel, 100)}%` }}
            />
          </div>
        </div>
      ) : (
        <div className="w-full rounded aspect-video bg-black flex items-center justify-center">
          <span className="text-xs text-zinc-600">
            {cameraEnabled ? 'Requesting camera access...' : 'Camera off — audio only'}
          </span>
        </div>
      )}
    </div>
  );
}

// =============================================================================
// AUDIO VISUALIZER (Gemini-only — uses AnalyserNode)
// =============================================================================

export function AudioVisualizer({
  analyser,
  label = 'AI Audio Output',
}: {
  analyser: AnalyserNode | null;
  label?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef<number>(0);

  useEffect(() => {
    if (!analyser || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const draw = () => {
      frameRef.current = requestAnimationFrame(draw);
      analyser.getByteFrequencyData(dataArray);

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const barWidth = (canvas.width / bufferLength) * 2.5;
      let x = 0;

      for (let i = 0; i < bufferLength; i++) {
        const barHeight = (dataArray[i] / 255) * canvas.height;
        const hue = (i / bufferLength) * 120 + 200; // blue to cyan gradient
        ctx.fillStyle = `hsla(${hue}, 80%, 60%, 0.8)`;
        ctx.fillRect(x, canvas.height - barHeight, barWidth, barHeight);
        x += barWidth + 1;
      }
    };

    draw();
    return () => cancelAnimationFrame(frameRef.current);
  }, [analyser]);

  return (
    <div className="bg-zinc-900/50 rounded-lg border border-zinc-800 p-3">
      <h2 className="text-xs font-medium text-zinc-500 mb-2">{label}</h2>
      <canvas
        ref={canvasRef}
        width={400}
        height={60}
        className="w-full h-[60px] rounded"
      />
    </div>
  );
}
