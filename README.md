# @classytic/realtime-agents

Provider-agnostic realtime voice agent orchestration for React.

Build voice-powered AI agents that work with **OpenAI Realtime API** and **Google Gemini Live API** using a single, unified interface.

## Features

- **Provider-agnostic** -- same React hook and tool API for OpenAI and Gemini
- **Zero-config defaults** -- sensible defaults for codec, model, context management
- **Tool calling** -- define tools once with Zod schemas, works across providers
- **Context management** -- automatic sliding window (Gemini) and retention ratio (OpenAI) for long sessions
- **History injection** -- pre-seed conversations with previous turns
- **Session resumption** -- reconnect Gemini sessions without losing context
- **Audio I/O** -- WebRTC (OpenAI) and AudioWorklet (Gemini/OpenAI WebSocket)
- **Video support** -- camera frame capture for Gemini Live multimodal sessions
- **Usage tracking** -- real-time token consumption via reactive state
- **TypeScript-first** -- full type safety with exported types for all APIs

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
import { useRealtimeSession, tool } from '@classytic/realtime-agents';
import { OpenAIAdapter } from '@classytic/realtime-agents/openai';
import { z } from 'zod';

const adapter = useMemo(() => new OpenAIAdapter(), []);
// Defaults: WebRTC, opus codec, gpt-realtime, retention_ratio 0.8

const session = useRealtimeSession(adapter, {
  onTranscriptComplete: (entry) => console.log(entry.role, entry.text),
  onError: (err) => console.error(err),
});

// Connect
await session.connect({
  getCredentials: async () => {
    const res = await fetch('/api/session');
    const data = await res.json();
    return data.client_secret.value;
  },
  agent: {
    name: 'assistant',
    instructions: 'You are a helpful assistant.',
    tools: [weatherTool],
    voice: 'coral',
  },
});

// Controls
session.sendMessage('Hello!');
session.mute(true);
session.interrupt();
session.disconnect();
```

### Gemini

```tsx
import { useRealtimeSession } from '@classytic/realtime-agents';
import { GeminiAdapter } from '@classytic/realtime-agents/gemini';

const adapter = useMemo(() => new GeminiAdapter(), []);
// Defaults: gemini-2.5-flash, transcription on, sliding window compression

const session = useRealtimeSession(adapter, { /* same callbacks */ });

await session.connect({
  getCredentials: async () => {
    const res = await fetch('/api/gemini-session');
    return (await res.json()).apiKey;
  },
  agent: {
    name: 'assistant',
    instructions: 'You are a helpful assistant.',
    tools: [weatherTool],
    voice: 'Kore',
  },
});
```

## Defining Tools

Tools use Zod schemas and work identically across providers:

```ts
import { tool } from '@classytic/realtime-agents';
import { z } from 'zod';

const weatherTool = tool({
  name: 'get_weather',
  description: 'Get current weather for a city',
  parameters: z.object({ city: z.string() }),
  execute: async ({ city }) => {
    const res = await fetch(`/api/weather?city=${city}`);
    return res.json();
  },
});
```

## Context Providers

Wrap your app with `EventProvider` and `TranscriptProvider` for shared transcript/event state:

```tsx
import { EventProvider, TranscriptProvider } from '@classytic/realtime-agents';

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

## History Injection

Pre-seed sessions with previous conversation turns:

```ts
await session.connect({
  getCredentials,
  agent,
  history: [
    { role: 'user', text: 'My name is Alice.' },
    { role: 'assistant', text: 'Nice to meet you, Alice!' },
  ],
});
```

## Context Management

Both adapters default to `retentionRatio: 0.8` for long-running sessions. Override per-adapter:

```ts
// OpenAI: keep 60% of context on truncation
new OpenAIAdapter({ contextManagement: { retentionRatio: 0.6 } });

// Gemini: custom trigger threshold
new GeminiAdapter({ contextManagement: { triggerTokens: 80000, retentionRatio: 0.5 } });

// Disable context management (not recommended for long sessions)
new OpenAIAdapter({ contextManagement: { mode: 'disabled' } });
```

## Adapter Options

### OpenAIAdapter

| Option | Default | Description |
|--------|---------|-------------|
| `transport` | `'webrtc'` | `'webrtc'` or `'websocket'` |
| `codec` | `'opus'` | Audio codec for WebRTC |
| `model` | `'gpt-realtime'` | OpenAI model identifier |
| `transcriptionModel` | `'gpt-4o-mini-transcribe'` | Transcription model |
| `vadEagerness` | `'medium'` | Voice activity detection sensitivity |
| `contextManagement` | `{ mode: 'auto', retentionRatio: 0.8 }` | Context window management |

### GeminiAdapter

| Option | Default | Description |
|--------|---------|-------------|
| `model` | `'gemini-2.5-flash-...'` | Gemini Live model |
| `inputSampleRate` | `16000` | Input audio sample rate (Hz) |
| `outputSampleRate` | `24000` | Output audio sample rate (Hz) |
| `inputTranscription` | `true` | Transcribe user speech |
| `outputTranscription` | `true` | Transcribe model speech |
| `enableVideo` | `false` | Request camera in getUserMedia |
| `videoFrameInterval` | `5000` | Ms between video frame captures |
| `sessionResumption` | -- | Resume a previous session |
| `contextManagement` | `{ mode: 'auto', retentionRatio: 0.8 }` | Sliding window compression |

## Usage Tracking

```ts
// Reactive state (updates in real-time)
const { usage } = session;
console.log(usage?.inputTokens, usage?.outputTokens, usage?.totalTokens);

// Snapshot (e.g., before disconnect)
const snapshot = session.getUsage();
```

## API Reference

### Core Exports (`@classytic/realtime-agents`)

| Export | Type | Description |
|--------|------|-------------|
| `useRealtimeSession` | Hook | Main React hook for voice sessions |
| `useSessionHistory` | Hook | Session history management |
| `tool` | Function | Create provider-agnostic tool definitions |
| `buildInstructions` | Function | Template-based instruction builder |
| `EventProvider` | Component | Event context provider |
| `TranscriptProvider` | Component | Transcript context provider |
| `useEvent` | Hook | Access event context |
| `useTranscript` | Hook | Access transcript context |

### Provider Exports

```ts
// OpenAI
import { OpenAIAdapter, OPENAI_VOICES, OPENAI_DEFAULT_VOICE } from '@classytic/realtime-agents/openai';

// Gemini
import { GeminiAdapter, GEMINI_VOICES, GEMINI_DEFAULT_VOICE } from '@classytic/realtime-agents/gemini';
```

## Requirements

- React 19+
- Node.js 20+
- Zod 3.x or 4.x

## License

MIT
