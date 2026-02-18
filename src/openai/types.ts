/**
 * @classytic/realtime-agents/openai - Types
 */

import type { ContextManagement } from '../types.js';

export interface OpenAIAdapterOptions {
  /**
   * Transport protocol for the connection (default: 'webrtc').
   *
   * - `'webrtc'` — WebRTC with automatic microphone/speaker handling (browser only).
   * - `'websocket'` — WebSocket transport. Audio must be handled separately.
   *   Useful for Node.js or environments without WebRTC.
   */
  readonly transport?: 'webrtc' | 'websocket';
  /** Preferred audio codec for WebRTC (default: 'opus') */
  readonly codec?: string;
  /** OpenAI model identifier (default: 'gpt-realtime') */
  readonly model?: string;
  /** Transcription model (default: 'gpt-4o-mini-transcribe') */
  readonly transcriptionModel?: string;
  /** VAD eagerness (default: 'medium') */
  readonly vadEagerness?: 'low' | 'medium' | 'high' | 'auto';
  /**
   * Context window management.
   *
   * Defaults: `mode: 'auto'`, `retentionRatio: 0.8` — uses OpenAI's
   * `retention_ratio` strategy which optimizes prompt caching by truncating
   * more aggressively at once (~28k of 32k context window).
   *
   * Set `mode: 'disabled'` to turn off truncation (errors at 28k tokens).
   *
   * @see ContextManagement for the unified provider-agnostic interface.
   */
  readonly contextManagement?: ContextManagement;
}
