/**
 * @classytic/realtime-agents/openai - Types
 */

import type { RealtimeOutputGuardrail, RealtimeSessionConfig } from '@openai/agents/realtime';
import type { ContextManagement } from '../types.js';

export interface OpenAIRealtimePromptDefinition {
  readonly promptId: string;
  readonly version?: string;
  readonly variables?: Readonly<Record<string, string>>;
}

export interface OpenAIAgentProviderOptions {
  /** Reusable hosted prompt reference supported by the OpenAI Realtime API. */
  readonly prompt?: OpenAIRealtimePromptDefinition;
  /** Human-readable description used when the agent participates in handoffs. */
  readonly handoffDescription?: string;
}

export interface OpenAISessionProviderOptions {
  /** Additional `RealtimeSession` options forwarded to the OpenAI Agents SDK. */
  readonly outputGuardrails?: readonly RealtimeOutputGuardrail[];
  readonly outputGuardrailSettings?: Readonly<Record<string, unknown>>;
  readonly historyStoreAudio?: boolean;
  readonly tracingDisabled?: boolean;
  readonly workflowName?: string;
  readonly groupId?: string;
  readonly traceMetadata?: Readonly<Record<string, unknown>>;
  readonly automaticallyTriggerResponseForMcpToolCalls?: boolean;
  readonly toolErrorFormatter?: (args: unknown) => string | undefined | Promise<string | undefined>;
  /**
   * Additional realtime session config.
   *
   * This uses the OpenAI Agents SDK session config shape and is merged with the
   * adapter defaults for audio format, transcription, turn detection, and
   * truncation settings.
   */
  readonly sessionConfig?: Partial<RealtimeSessionConfig>;
}

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
  /** Optional transcription language hint forwarded to the Realtime session config. */
  readonly transcriptionLanguage?: string;
  /** Optional transcription prompt to improve recognition of jargon or names. */
  readonly transcriptionPrompt?: string;
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
  /** Reusable OpenAI session options applied to every connect call unless overridden. */
  readonly sessionOptions?: OpenAISessionProviderOptions;
  /** Enable verbose debug logging for the adapter (default: false). Also toggleable at runtime via `window.__OPENAI_ADAPTER_DEBUG = true`. */
  readonly debug?: boolean;
}

export function openAIAgentOptions(
  options: OpenAIAgentProviderOptions,
): Readonly<{ openai: OpenAIAgentProviderOptions }> {
  return { openai: options };
}

export function openAISessionOptions(
  options: OpenAISessionProviderOptions,
): Readonly<{ openai: OpenAISessionProviderOptions }> {
  return { openai: options };
}
