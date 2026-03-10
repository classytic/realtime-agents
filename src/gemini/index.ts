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
export {
  GEMINI_DEFAULT_CONTEXT_MANAGEMENT,
  GEMINI_LOW_LATENCY_CONTEXT_MANAGEMENT,
  GEMINI_DEFAULT_AUDIO_TRANSCRIPTION_CONFIG,
  GEMINI_DEFAULT_SPEECH_CONFIG,
  GEMINI_EN_IN_SPEECH_CONFIG,
  GEMINI_HI_IN_SPEECH_CONFIG,
  GEMINI_BN_BD_SPEECH_CONFIG,
  GEMINI_DEFAULT_SESSION_OPTIONS,
  GEMINI_LOW_LATENCY_SESSION_OPTIONS,
} from './config.js';
export { geminiSessionOptions } from './types.js';
export type {
  GeminiAdapterOptions,
  GeminiSessionProviderOptions,
  GeminiLiveAudioTranscriptionConfig,
  GeminiLiveContextWindowCompression,
  GeminiLiveProactivityConfig,
  GeminiLiveRealtimeInputConfig,
  GeminiLiveResponseModalities,
  GeminiLiveSessionResumption,
  GeminiLiveSpeechConfig,
  GeminiLiveThinkingConfig,
  GeminiLiveToolList,
} from './types.js';
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
