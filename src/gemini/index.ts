/**
 * @classytic/realtime-agents/gemini
 *
 * Gemini Live API adapter using WebSocket transport.
 *
 * @example
 * ```typescript
 * import { GeminiAdapter } from '@classytic/realtime-agents/gemini';
 *
 * const adapter = useMemo(() => new GeminiAdapter(), []);
 * ```
 */

export { GeminiAdapter } from './adapter.js';
export { GEMINI_VOICES, GEMINI_DEFAULT_VOICE } from './voices.js';
export type { GeminiVoiceOption, GeminiVoiceId } from './voices.js';
export type { GeminiAdapterOptions } from './types.js';
export {
  GEMINI_LIVE_MODELS,
  GEMINI_DEFAULT_MODEL,
  GEMINI_TRANSPORTS,
  GEMINI_DEFAULT_TRANSPORT,
} from './models.js';
export type {
  GeminiLiveModel,
  GeminiLiveModelId,
  GeminiTransport,
} from './models.js';

// Audio utilities — re-exported from shared audio module for backward compatibility
export {
  base64ToUint8Array,
  uint8ArrayToBase64,
  createPcmBlob,
  decodeAudioData,
} from '../audio/pcm-utils.js';
export { getAudioWorkletUrl, RECORDER_WORKLET_CODE } from '../audio/worklet.js';
