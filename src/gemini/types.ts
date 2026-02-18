/**
 * @classytic/realtime-agents/gemini - Types
 */

import type { ContextManagement } from '../types.js';

export interface GeminiAdapterOptions {
  /** Gemini Live model identifier (default: 'gemini-live-2.5-flash-preview') */
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
}
