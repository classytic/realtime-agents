/**
 * @classytic/realtime-agents/gemini - Model Constants
 *
 * Supported models for Gemini Live API.
 * Source: Google GenAI SDK samples + documentation.
 *
 * Gemini Live uses **WebSocket only** — no WebRTC transport is available.
 */

export interface GeminiLiveModel {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  /** Whether this model requires Vertex AI (as opposed to ML Developer API) */
  readonly vertexOnly?: boolean;
}

/**
 * Live-capable Gemini models.
 *
 * Only models with the `live` designation support the bidirectional
 * streaming Live API. Standard Gemini models (e.g. `gemini-2.5-flash`)
 * support only unary generate/chat — they cannot be used with `ai.live.connect()`.
 */
export const GEMINI_LIVE_MODELS: readonly GeminiLiveModel[] = [
  { id: 'gemini-2.5-flash-native-audio-preview-12-2025', name: 'Gemini 2.5 Flash Native Audio', description: 'Latest Live model with native audio (ML Developer API)' },
] as const;

export const GEMINI_DEFAULT_MODEL = 'gemini-2.5-flash-native-audio-preview-12-2025';

/**
 * Gemini Live transport.
 *
 * Unlike OpenAI, the Gemini Live API only supports WebSocket.
 * Audio I/O is managed via AudioContext + AudioWorklet in the adapter.
 */
export type GeminiTransport = 'websocket';

export const GEMINI_TRANSPORTS: readonly { id: GeminiTransport; name: string; description: string }[] = [
  { id: 'websocket', name: 'WebSocket', description: 'Bidirectional WebSocket with manual audio handling' },
] as const;

export const GEMINI_DEFAULT_TRANSPORT: GeminiTransport = 'websocket';

export type GeminiLiveModelId = (typeof GEMINI_LIVE_MODELS)[number]['id'];
