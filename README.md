# @classytic/realtime-agents

Provider-agnostic realtime voice agent orchestration for React.

Build voice-powered AI agents that work with **OpenAI Realtime API** and **Google Gemini Live API** using a single, unified interface.

## Features

- **Provider-agnostic** -- same React hook and tool API for OpenAI and Gemini
- **Zero-config defaults** -- sensible defaults for codec, model, context management
- **Tool calling** -- define tools once with Zod schemas, works across providers
- **Tool context** -- global session context accessible from any tool during execution
- **Context management** -- automatic sliding window (Gemini) and retention ratio (OpenAI) for long sessions
- **History injection** -- pre-seed conversations with previous turns
- **Session resumption** -- reconnect Gemini sessions without losing context
- **Audio I/O** -- WebRTC (OpenAI) and AudioWorklet (Gemini/OpenAI WebSocket)
- **Image/Video support** -- send camera frames or screenshots via `sendImage`
- **Usage tracking** -- real-time token consumption via reactive state
- **Auto-reconnect** -- automatic retry with exponential backoff on unexpected disconnects
- **Push-to-talk** -- manual voice activation mode
- **TypeScript-first** -- full type safety with exported types for all APIs

Native multi-agent handoffs are currently an **OpenAI Agents SDK** capability. Gemini Live can share the same tool and session abstraction in this package, but OpenAI remains the only provider here with built-in agent-to-agent transfer semantics.

## Install

```bash
npm install @classytic/realtime-agents
```

**Peer dependencies** (install the ones you need):

```bash
# For OpenAI Realtime
npm install @openai/agents

# For Gemini Live
npm install @google/genai

# Required
npm install react zod
```

## Quick Start

### OpenAI

```tsx
import { useRealtimeSession, tool } from "@classytic/realtime-agents";
import {
  OpenAIAdapter,
  OPENAI_LOW_LATENCY_SESSION_OPTIONS,
  OPENAI_INTERVIEW_TRANSCRIPTION_CONFIG,
  OPENAI_SPEECH_STYLE_HINTS,
  openAIAgentOptions,
  openAISessionOptions,
} from "@classytic/realtime-agents/openai";
import { z } from "zod";

const adapter = useMemo(
  () =>
    new OpenAIAdapter({
      sessionOptions: OPENAI_LOW_LATENCY_SESSION_OPTIONS,
      transcriptionLanguage: "en",
      transcriptionModel: OPENAI_INTERVIEW_TRANSCRIPTION_CONFIG.model,
      transcriptionPrompt: OPENAI_INTERVIEW_TRANSCRIPTION_CONFIG.prompt,
    }),
  [],
);
// Defaults: WebRTC, gpt-realtime, retention_ratio 0.8, plus low-latency session preset

const session = useRealtimeSession(adapter, {
  onTranscriptComplete: (entry) => console.log(entry.role, entry.text),
  onError: (err) => console.error(err),
});

// Connect
await session.connect({
  getCredentials: async () => {
    const res = await fetch("/api/session");
    const data = await res.json();
    return data.client_secret.value;
  },
  agent: {
    name: "assistant",
    instructions: `You are a helpful assistant. ${OPENAI_SPEECH_STYLE_HINTS["en-IN"]}`,
    tools: [weatherTool],
    voice: "coral",
    providerOptions: openAIAgentOptions({
      prompt: {
        promptId: "pmpt_123",
        version: "3",
        variables: { locale: "en-IN" },
      },
    }),
  },
  providerOptions: openAISessionOptions({
    ...OPENAI_LOW_LATENCY_SESSION_OPTIONS,
    workflowName: "interview-session",
  }),
});

// Controls
session.sendMessage("Hello!");
session.sendImage(canvasDataUrl); // Send image to the model
session.mute(true); // User mute — blocks auto-unmute
session.mute(true, { source: "system" }); // System mute — auto-unmute still works
session.interrupt();
session.disconnect();
```

### Gemini

```tsx
import { useRealtimeSession } from "@classytic/realtime-agents";
import {
  GeminiAdapter,
  GEMINI_EN_IN_SPEECH_CONFIG,
  GEMINI_LOW_LATENCY_SESSION_OPTIONS,
  geminiSessionOptions,
} from "@classytic/realtime-agents/gemini";

const adapter = useMemo(
  () => new GeminiAdapter({ sessionOptions: GEMINI_LOW_LATENCY_SESSION_OPTIONS }),
  [],
);
// Defaults: gemini-2.5-flash-native-audio-preview-12-2025, transcription on, sliding window compression

const session = useRealtimeSession(adapter, {
  /* same callbacks */
});

await session.connect({
  getCredentials: async () => {
    const res = await fetch("/api/gemini-session");
    return (await res.json()).apiKey;
  },
  agent: {
    name: "assistant",
    instructions: "You are a helpful assistant.",
    tools: [weatherTool],
    voice: "Kore",
  },
  providerOptions: geminiSessionOptions({
    speechConfig: GEMINI_EN_IN_SPEECH_CONFIG,
    explicitVadSignal: true,
    // Escape hatch for newer Gemini Live config without waiting for a wrapper release
    config: {},
  }),
});
```

## Status Types

```ts
type SessionStatus = "disconnected" | "connecting" | "connected";
type AgentStatus = "idle" | "listening" | "speaking" | "thinking";
```

`agentStatus` reflects what the voice agent is currently doing and is useful for driving UI visualizations (e.g. animated orbs, status indicators).

## Defining Tools

Tools use Zod schemas and work identically across providers:

```ts
import { tool } from "@classytic/realtime-agents";
import { z } from "zod";

const weatherTool = tool({
  name: "get_weather",
  description: "Get current weather for a city",
  parameters: z.object({ city: z.string() }),
  execute: async ({ city }) => {
    const res = await fetch(`/api/weather?city=${city}`);
    return res.json();
  },
});
```

## Tool Context

Tools that need access to the active session (e.g. to send images or read session context) can use the global tool context:

```ts
import { getToolContext } from "@classytic/realtime-agents";

const captureImageTool = tool({
  name: "capture_image",
  description: "Capture and analyze the current camera frame",
  parameters: z.object({}),
  execute: async () => {
    const ctx = getToolContext();

    // Access session context passed during connect
    const interviewId = ctx.sessionContext.interviewId;

    // Send an image through the active session
    ctx.sendImage(dataUrl, { triggerResponse: true });

    // Access the raw provider session (escape hatch)
    const rawSession = ctx.providerSession;

    return { captured: true };
  },
});
```

The tool context is automatically set during `connect()` and cleared on `disconnect()`. The `sessionContext` object comes from the `context` option passed to `connect()`.

## Connect Options

```ts
await session.connect({
  // Required: returns API key or client secret
  getCredentials: async () => "...",

  // Required: agent configuration
  agent: {
    name: "assistant",
    instructions: "You are a helpful assistant.",
    tools: [weatherTool],
    voice: "coral",
      providerOptions: openAIAgentOptions({
        prompt: {
          promptId: "pmpt_123",
          variables: { locale: "en-IN" },
        },
      }),
  },

  // Optional: HTML audio element for playback (WebRTC)
  audioElement: document.getElementById("audio"),

  // Optional: session context accessible via getToolContext()
  context: { interviewId: "123", candidateName: "Alice" },

  // Optional: pass an existing MediaStream (e.g. with video tracks)
  mediaStream: cameraStream,

  // Optional: pre-seed conversation history
  history: [
    { role: "user", text: "My name is Alice." },
    { role: "assistant", text: "Nice to meet you, Alice!" },
  ],

  // Optional: provider-native session options
  providerOptions: openAISessionOptions({
    workflowName: "interview-session",
    sessionConfig: OPENAI_LOW_LATENCY_SESSION_OPTIONS.sessionConfig,
  }),
});
```

## Session Controls

The `useRealtimeSession` hook returns these controls:

| Method                           | Description                                                                                          |
| -------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `connect(options)`               | Connect to the voice session                                                                         |
| `disconnect()`                   | Disconnect and clean up                                                                              |
| `sendMessage(text)`              | Send a text message to the agent                                                                     |
| `sendImage(dataUrl, options?)`   | Send an image to the model. `triggerResponse` (default `false`) makes the model respond to the image |
| `sendSimulatedUserMessage(text)` | Inject a synthetic user message into the conversation (appears as if the user said it)               |
| `mute(muted, options?)`          | Mute/unmute the microphone. Pass `{ source: 'system' }` for programmatic mutes that shouldn't block auto-unmute in non-interruptible mode (default: `'user'`) |
| `interrupt()`                    | Interrupt the agent's current response                                                               |
| `pushToTalkStart()`              | Begin push-to-talk recording                                                                         |
| `pushToTalkStop()`               | End push-to-talk recording                                                                           |
| `sendEvent(event)`               | Send a raw transport event (provider-specific)                                                       |
| `getUsage()`                     | Get a snapshot of token usage                                                                        |

Plus reactive state:

| Property      | Type                | Description                                                  |
| ------------- | ------------------- | ------------------------------------------------------------ |
| `status`      | `SessionStatus`     | `'disconnected'` \| `'connecting'` \| `'connected'`          |
| `agentStatus` | `AgentStatus`       | `'idle'` \| `'listening'` \| `'speaking'` \| `'thinking'`    |
| `usage`       | `UsageInfo \| null` | Real-time token consumption (updates as tokens are consumed) |

## Session Callbacks

```ts
const session = useRealtimeSession(adapter, {
  onStatusChange: (status) => {}, // Session connected/disconnected
  onAgentStatusChange: (status) => {}, // Agent idle/listening/speaking/thinking
  onError: (error) => {}, // Connection or runtime errors
  onTranscriptComplete: (entry) => {}, // Finalized transcript (user or assistant)
  onAgentHandoff: (agentName) => {}, // Agent-to-agent handoff
  onUserSpeechStart: () => {}, // User started speaking
  onUserSpeechStop: () => {}, // User stopped speaking
  onToolStart: (toolName, args) => {}, // Tool invocation started
  onToolEnd: (toolName, result) => {}, // Tool invocation finished
  onUsageUpdate: (usage) => {}, // Token usage changed
  onTransportEvent: (event) => {}, // Raw provider transport event
  onGuardrailTripped: (result) => {}, // Guardrail result (OpenAI)
  onToolApprovalRequest: async (name, args) => true, // Approve/reject tool calls
});
```

## Presets And Provider Options

`@classytic/realtime-agents/openai` exports reusable presets and typed helpers:

```ts
import {
  OPENAI_DEFAULT_CONTEXT_MANAGEMENT,
  OPENAI_LOW_LATENCY_CONTEXT_MANAGEMENT,
  OPENAI_DEFAULT_SESSION_OPTIONS,
  OPENAI_LOW_LATENCY_SESSION_OPTIONS,
  OPENAI_DEFAULT_TURN_DETECTION,
  OPENAI_INTERVIEW_TRANSCRIPTION_CONFIG,
  OPENAI_SPEECH_STYLE_HINTS,
  openAIAgentOptions,
  openAISessionOptions,
} from "@classytic/realtime-agents/openai";
```

`@classytic/realtime-agents/gemini` exports equivalent session helpers:

```ts
import {
  GEMINI_DEFAULT_CONTEXT_MANAGEMENT,
  GEMINI_LOW_LATENCY_CONTEXT_MANAGEMENT,
  GEMINI_DEFAULT_SESSION_OPTIONS,
  GEMINI_LOW_LATENCY_SESSION_OPTIONS,
  geminiSessionOptions,
} from "@classytic/realtime-agents/gemini";
```

## Auto-Reconnect

Use `useAutoReconnect` as a drop-in replacement for `useRealtimeSession` to automatically recover from unexpected disconnects:

```tsx
import { useAutoReconnect } from "@classytic/realtime-agents";
import { OpenAIAdapter } from "@classytic/realtime-agents/openai";

const adapter = useMemo(() => new OpenAIAdapter(), []);

const session = useAutoReconnect(
  adapter,
  {
    // All standard SessionCallbacks, plus:
    onReconnecting: (attempt, max) =>
      toast.info(`Reconnecting ${attempt}/${max}...`),
    onReconnected: () => toast.success("Reconnected!"),
    onReconnectFailed: () => toast.error("Connection lost. Please refresh."),
  },
  {
    maxAttempts: 3, // default: 3
    baseDelay: 1000, // default: 1000ms
    maxDelay: 8000, // default: 8000ms
    injectHistory: true, // default: true — re-inject transcript on reconnect
  },
);

// Same API as useRealtimeSession, plus:
session.isReconnecting; // boolean
session.reconnectAttempt; // 0 when not reconnecting
```

**How it works:**

1. Tracks whether `disconnect()` was called intentionally vs the connection dropped unexpectedly
2. On unexpected disconnect, retries with exponential backoff + jitter (1s → 2s → 4s → 8s cap)
3. **Gemini**: Calls `adapter.prepareReconnect()` which sets the session resumption handle — the reconnected session picks up where it left off server-side
4. **OpenAI**: Re-injects accumulated transcript as `history` on reconnect — the agent has conversational context (audio context is lost, but transcript-based context is preserved)
5. Exposes `isReconnecting` and `reconnectAttempt` for UI feedback (e.g. loading spinners, toast notifications)

| Config          | Default | Description                               |
| --------------- | ------- | ----------------------------------------- |
| `maxAttempts`   | `3`     | Number of retry attempts before giving up |
| `baseDelay`     | `1000`  | Initial delay in ms before first retry    |
| `maxDelay`      | `8000`  | Maximum delay with exponential backoff    |
| `injectHistory` | `true`  | Re-inject transcript history on reconnect |

## Context Providers

Wrap your app with `EventProvider` and `TranscriptProvider` for shared transcript/event state:

```tsx
import { EventProvider, TranscriptProvider } from "@classytic/realtime-agents";

function App() {
  return (
    <EventProvider>
      <TranscriptProvider>
        <VoiceAgent />
      </TranscriptProvider>
    </EventProvider>
  );
}
```

## Context Management

Both adapters default to `retentionRatio: 0.8` for long-running sessions. Override per-adapter:

```ts
// OpenAI: keep 60% of context on truncation
new OpenAIAdapter({ contextManagement: { retentionRatio: 0.6 } });

// Gemini: custom trigger threshold
new GeminiAdapter({
  contextManagement: { triggerTokens: 80000, retentionRatio: 0.5 },
});

// Disable context management (not recommended for long sessions)
new OpenAIAdapter({ contextManagement: { mode: "disabled" } });
```

## Adapter Options

### OpenAIAdapter

| Option               | Default                                 | Description                                                          |
| -------------------- | --------------------------------------- | -------------------------------------------------------------------- |
| `transport`          | `'webrtc'`                              | `'webrtc'` or `'websocket'`                                          |
| `codec`              | `'opus'`                                | Audio codec for WebRTC                                               |
| `model`              | `'gpt-realtime'`                        | OpenAI model identifier                                              |
| `transcriptionModel` | `'gpt-4o-mini-transcribe'`              | Transcription model                                                  |
| `transcriptionLanguage` | `undefined`                          | Optional language hint for speech recognition                        |
| `transcriptionPrompt` | `undefined`                            | Optional jargon/name hint for speech recognition                     |
| `vadEagerness`       | `'medium'`                              | Voice activity detection: `'low'`, `'medium'`, `'high'`, or `'auto'` |
| `contextManagement`  | `{ mode: 'auto', retentionRatio: 0.8 }` | Context window management                                            |

### Choosing a Transcription Model

- `gpt-4o-mini-transcribe`: fastest and cheapest. Good default for most voice UX.
- `gpt-4o-transcribe`: slower than mini but more accurate. Better for interviews, accents, names, and technical jargon.
- `gpt-4o-transcribe-latest`: use when you want OpenAI's latest transcribe alias instead of a pinned choice.

Example:

```ts
import {
  OpenAIAdapter,
  OPENAI_HIGH_ACCURACY_SESSION_OPTIONS,
  OPENAI_INTERVIEW_TRANSCRIPTION_CONFIG,
} from "@classytic/realtime-agents/openai";

const adapter = new OpenAIAdapter({
  sessionOptions: OPENAI_HIGH_ACCURACY_SESSION_OPTIONS,
  transcriptionModel: OPENAI_INTERVIEW_TRANSCRIPTION_CONFIG.model,
  transcriptionPrompt: OPENAI_INTERVIEW_TRANSCRIPTION_CONFIG.prompt,
});
```

### GeminiAdapter

| Option                | Default                                 | Description                                             |
| --------------------- | --------------------------------------- | ------------------------------------------------------- |
| `model`               | `'gemini-live-2.5-flash-preview'`       | Gemini Live model                                       |
| `inputSampleRate`     | `16000`                                 | Input audio sample rate (Hz)                            |
| `outputSampleRate`    | `24000`                                 | Output audio sample rate (Hz)                           |
| `inputTranscription`  | `true`                                  | Transcribe user speech                                  |
| `outputTranscription` | `true`                                  | Transcribe model speech                                 |
| `enableVideo`         | `false`                                 | Request camera in getUserMedia                          |
| `videoFrameInterval`  | `5000`                                  | Ms between video frame captures (0 to disable)          |
| `sessionResumption`   | --                                      | `{ handle?, transparent? }` — resume a previous session |
| `contextManagement`   | `{ mode: 'auto', retentionRatio: 0.8 }` | Sliding window compression                              |

### Audio Analyser

Both adapters expose `getOutputAnalyser()` which returns an `AnalyserNode` for the AI's audio output. Use this to drive audio visualizations:

```ts
const adapter = useMemo(() => new OpenAIAdapter(), []);

// After connect, get the analyser node
const analyser = adapter.getOutputAnalyser(); // AnalyserNode | null
```

## Usage Tracking

```ts
// Reactive state (updates in real-time)
const { usage } = session;
console.log(usage?.inputTokens, usage?.outputTokens, usage?.totalTokens);
// Granular breakdown: usage?.inputTokensDetails, usage?.outputTokensDetails
// OpenAI also exposes usage?.requests when available
// Advanced analytics: usage?.rawUsage contains the provider-native payload

// Snapshot (e.g., before disconnect)
const snapshot = session.getUsage();
```

`UsageInfo` is the unified token accounting shape across providers:

- `inputTokens`
- `outputTokens`
- `totalTokens`
- `requests?`
- `inputTokensDetails?`
- `outputTokensDetails?`
- `rawUsage?`

OpenAI currently provides the richest usage detail. Gemini Live currently provides reliable top-level token counts and exposes the provider payload through `rawUsage`.

## API Reference

### Core Exports (`@classytic/realtime-agents`)

| Export               | Type      | Description                                                                 |
| -------------------- | --------- | --------------------------------------------------------------------------- |
| `useRealtimeSession` | Hook      | Main React hook for voice sessions                                          |
| `useAutoReconnect`   | Hook      | Drop-in replacement with auto-reconnection on unexpected disconnects        |
| `useSessionHistory`  | Hook      | Session history management                                                  |
| `tool`               | Function  | Create provider-agnostic tool definitions                                   |
| `buildInstructions`  | Function  | Template `{{variable}}` replacement for dynamic instructions                |
| `getToolContext`     | Function  | Get the current session's tool context (for tools that need session access) |
| `setToolContext`     | Function  | Set the tool context (called automatically during connect)                  |
| `clearToolContext`   | Function  | Clear the tool context (called automatically during disconnect)             |
| `EventProvider`      | Component | Event context provider                                                      |
| `TranscriptProvider` | Component | Transcript context provider                                                 |
| `useEvent`           | Hook      | Access event context                                                        |
| `useTranscript`      | Hook      | Access transcript context                                                   |

#### Exported Types

`SessionStatus`, `AgentStatus`, `TranscriptEntry`, `AgentTool`, `AgentConfig`, `HistoryEntry`, `ConnectOptions`, `TransportEventHandlers`, `RealtimeAdapter`, `SessionCallbacks`, `UseRealtimeSessionReturn`, `UsageInfo`, `ContextManagement`, `ReconnectConfig`, `AutoReconnectCallbacks`, `UseAutoReconnectReturn`, `ToolContext`, `ModerationCategory`, `GuardrailResultType`, `TranscriptItem`, `LoggedEvent`

### Provider Exports

```ts
// OpenAI
import {
  OpenAIAdapter,
  OPENAI_VOICES,
  OPENAI_DEFAULT_VOICE,
  OPENAI_REALTIME_MODELS,
  OPENAI_DEFAULT_MODEL,
  OPENAI_TRANSCRIPTION_MODELS,
  OPENAI_DEFAULT_TRANSCRIPTION_MODEL,
  OPENAI_DEFAULT_TRANSCRIPTION_CONFIG,
  OPENAI_HIGH_ACCURACY_TRANSCRIPTION_CONFIG,
  OPENAI_INTERVIEW_TRANSCRIPTION_CONFIG,
  OPENAI_DEFAULT_SESSION_OPTIONS,
  OPENAI_HIGH_ACCURACY_SESSION_OPTIONS,
  OPENAI_LOW_LATENCY_SESSION_OPTIONS,
  OPENAI_TRANSPORTS,
  OPENAI_DEFAULT_TRANSPORT,
} from "@classytic/realtime-agents/openai";
import type {
  OpenAIAdapterOptions,
  OpenAIVoiceOption,
  OpenAIVoiceId,
  OpenAIRealtimeModel,
  OpenAIRealtimeModelId,
  OpenAITransport,
} from "@classytic/realtime-agents/openai";

// Gemini
import {
  GeminiAdapter,
  GEMINI_VOICES,
  GEMINI_DEFAULT_VOICE,
  GEMINI_LIVE_MODELS,
  GEMINI_DEFAULT_MODEL,
  GEMINI_TRANSPORTS,
  GEMINI_DEFAULT_TRANSPORT,
} from "@classytic/realtime-agents/gemini";
import type {
  GeminiAdapterOptions,
  GeminiVoiceOption,
  GeminiVoiceId,
  GeminiLiveModel,
  GeminiLiveModelId,
  GeminiTransport,
} from "@classytic/realtime-agents/gemini";

// Gemini also re-exports audio utilities
import {
  base64ToUint8Array,
  uint8ArrayToBase64,
  createPcmBlob,
  decodeAudioData,
  getAudioWorkletUrl,
  RECORDER_WORKLET_CODE,
} from "@classytic/realtime-agents/gemini";
```

## Requirements

- React 19+
- Node.js 20+
- Zod 3.x or 4.x

## License

MIT
