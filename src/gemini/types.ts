/**
 * @classytic/realtime-agents/gemini - Types
 */

import type { LiveConnectConfig } from '@google/genai';
import type { ContextManagement } from '../types.js';

export type GeminiLiveResponseModalities = LiveConnectConfig['responseModalities'];
export type GeminiLiveSpeechConfig = NonNullable<LiveConnectConfig['speechConfig']>;
export type GeminiLiveThinkingConfig = NonNullable<LiveConnectConfig['thinkingConfig']>;
export type GeminiLiveSessionResumption = NonNullable<LiveConnectConfig['sessionResumption']>;
export type GeminiLiveAudioTranscriptionConfig = NonNullable<LiveConnectConfig['inputAudioTranscription']>;
export type GeminiLiveRealtimeInputConfig = NonNullable<LiveConnectConfig['realtimeInputConfig']>;
export type GeminiLiveContextWindowCompression =
  NonNullable<LiveConnectConfig['contextWindowCompression']>;
export type GeminiLiveProactivityConfig = NonNullable<LiveConnectConfig['proactivity']>;
export type GeminiLiveToolList = NonNullable<LiveConnectConfig['tools']>;

export interface GeminiSessionProviderOptions {
  /**
   * Raw Gemini Live config merged after the typed options below.
   *
   * Use this as an escape hatch for newly released `@google/genai` features
   * that have not been promoted into first-class wrapper fields yet.
   */
  readonly config?: Partial<LiveConnectConfig>;
  /** Additional Gemini-native tools such as Google Search or URL context. */
  readonly tools?: GeminiLiveToolList;
  /** Requested response modalities. Defaults to `[Modality.AUDIO]`. */
  readonly responseModalities?: GeminiLiveResponseModalities;
  /** Speech generation controls such as language code or replicated voice config. */
  readonly speechConfig?: GeminiLiveSpeechConfig;
  /** Optional generation controls for models that support thinking. */
  readonly thinkingConfig?: GeminiLiveThinkingConfig;
  /** Optional generation controls. */
  readonly temperature?: LiveConnectConfig['temperature'];
  readonly topP?: LiveConnectConfig['topP'];
  readonly topK?: LiveConnectConfig['topK'];
  readonly maxOutputTokens?: LiveConnectConfig['maxOutputTokens'];
  readonly mediaResolution?: LiveConnectConfig['mediaResolution'];
  readonly seed?: LiveConnectConfig['seed'];
  /** Enables emotion-aware spoken responses on compatible Live models. */
  readonly enableAffectiveDialog?: LiveConnectConfig['enableAffectiveDialog'];
  /** Configures proactive responses on compatible native-audio models. */
  readonly proactivity?: GeminiLiveProactivityConfig;
  /** Enables explicit client-side VAD start/end signals. */
  readonly explicitVadSignal?: LiveConnectConfig['explicitVadSignal'];
  /** Configures input behavior for streaming text/audio/video. */
  readonly realtimeInputConfig?: GeminiLiveRealtimeInputConfig;
  /** Resumes a prior Gemini Live session. */
  readonly sessionResumption?: GeminiLiveSessionResumption;
  /** Explicit context compression config. When unset, adapter context management applies. */
  readonly contextWindowCompression?: GeminiLiveContextWindowCompression;
  /** Input transcription config. Set to `false` to disable it for this session. */
  readonly inputAudioTranscription?: GeminiLiveAudioTranscriptionConfig | false;
  /** Output transcription config. Set to `false` to disable it for this session. */
  readonly outputAudioTranscription?: GeminiLiveAudioTranscriptionConfig | false;
}

export interface GeminiAdapterOptions {
  /** Gemini Live model identifier (default: 'gemini-2.5-flash-native-audio-preview-12-2025') */
  readonly model?: string;
  /** Input audio sample rate in Hz (default: 16000) */
  readonly inputSampleRate?: number;
  /** Output audio sample rate in Hz (default: 24000) */
  readonly outputSampleRate?: number;
  /** Enable input (user) audio transcription (default: true) */
  readonly inputTranscription?: boolean;
  /** Enable output (model) audio transcription (default: true) */
  readonly outputTranscription?: boolean;
  /** Request video in getUserMedia — enables camera access for video calls (default: false) */
  readonly enableVideo?: boolean;
  /**
   * Interval in ms between video frame captures sent to the model.
   * Only used when the MediaStream has video tracks.
   * Set to 0 to disable auto-capture (you can still call sendImage manually).
   * Default: 5000 (5 seconds).
   */
  readonly videoFrameInterval?: number;
  /**
   * Resume a previous Gemini Live session.
   *
   * Pass the `handle` received from a prior `session_resumption_update` transport
   * event to continue where the last session left off. Set `transparent: true`
   * to receive `lastConsumedClientMessageIndex` for lossless reconnection.
   */
  readonly sessionResumption?: {
    readonly handle?: string;
    readonly transparent?: boolean;
  };
  /**
   * Context window management.
   *
   * Defaults: `mode: 'auto'`, `retentionRatio: 0.8` — enables sliding window
   * compression so sessions can run indefinitely.
   * Without compression, sessions are limited to ~15 min audio / ~2 min video.
   *
   * @see ContextManagement for the unified provider-agnostic interface.
   */
  readonly contextManagement?: ContextManagement;
  /** Reusable Gemini session options applied to every connect call unless overridden. */
  readonly sessionOptions?: GeminiSessionProviderOptions;
}

export function geminiSessionOptions(
  options: GeminiSessionProviderOptions,
): Readonly<{ gemini: GeminiSessionProviderOptions }> {
  return { gemini: options };
}
