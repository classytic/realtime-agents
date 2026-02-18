/**
 * @classytic/realtime-agents/openai
 *
 * OpenAI Realtime API adapter — supports WebRTC (default) and WebSocket transports.
 *
 * @example
 * ```typescript
 * import { OpenAIAdapter } from '@classytic/realtime-agents/openai';
 *
 * // Zero-config: WebRTC, opus codec, gpt-realtime, retention_ratio 0.8
 * const adapter = useMemo(() => new OpenAIAdapter(), []);
 *
 * // WebSocket transport (manual audio via AudioWorklet)
 * const wsAdapter = useMemo(() => new OpenAIAdapter({ transport: 'websocket' }), []);
 * ```
 */

export { OpenAIAdapter } from './adapter.js';
export { OPENAI_VOICES, OPENAI_DEFAULT_VOICE } from './voices.js';
export type { OpenAIVoiceOption, OpenAIVoiceId } from './voices.js';
export type { OpenAIAdapterOptions } from './types.js';
export {
  OPENAI_REALTIME_MODELS,
  OPENAI_DEFAULT_MODEL,
  OPENAI_TRANSCRIPTION_MODELS,
  OPENAI_DEFAULT_TRANSCRIPTION_MODEL,
  OPENAI_TRANSPORTS,
  OPENAI_DEFAULT_TRANSPORT,
} from './models.js';
export type {
  OpenAIRealtimeModel,
  OpenAIRealtimeModelId,
  OpenAITransport,
} from './models.js';
