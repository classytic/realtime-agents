/**
 * @classytic/realtime-agents - Core Types
 *
 * Provider-agnostic type definitions for realtime voice agent orchestration.
 */

import type { z } from 'zod';

// ── Status Types ──

export type SessionStatus = 'disconnected' | 'connecting' | 'connected';

export type AgentStatus = 'idle' | 'listening' | 'speaking' | 'thinking';

// ── Core Interfaces ──

export interface TranscriptEntry {
  readonly role: 'user' | 'assistant';
  readonly text: string;
  readonly itemId: string;
}

/**
 * A tool that can be invoked by the voice agent.
 *
 * Uses method syntax for `execute` intentionally — TypeScript treats methods
 * as bivariant, allowing `AgentTool<{location: string}>` to be assigned to
 * `AgentTool<unknown>` in collections like `AgentConfig.tools`.
 */
export interface AgentTool<TParams = unknown> {
  readonly name: string;
  readonly description: string;
  readonly parameters: z.ZodType<TParams>;
  execute(args: TParams): Promise<unknown>;
}

export interface AgentConfig {
  readonly name: string;
  readonly instructions: string;
  readonly tools: readonly AgentTool[];
  readonly voice?: string;
  readonly providerOptions?: ProviderOptionsMap;
}

export interface ProviderOptionsMap {
  readonly openai?: Readonly<Record<string, unknown>>;
  readonly gemini?: Readonly<Record<string, unknown>>;
}

export interface UsageInfo {
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly totalTokens: number;
  /** Total provider request count when the backend exposes it. */
  readonly requests?: number;
  /** Granular breakdown of input tokens (e.g. cached_tokens, audio_tokens) for pricing */
  readonly inputTokensDetails?: Readonly<Record<string, number>>;
  /** Granular breakdown of output tokens (e.g. audio_tokens) for pricing */
  readonly outputTokensDetails?: Readonly<Record<string, number>>;
  /** Raw provider-native usage payload for advanced analytics or billing reconciliation. */
  readonly rawUsage?: unknown;
}

/**
 * A conversation history entry for preloading context into a new session.
 *
 * Both OpenAI and Gemini support injecting previous turns so the agent
 * has conversational context without the user repeating themselves.
 */
export interface HistoryEntry {
  readonly role: 'user' | 'assistant';
  readonly text: string;
}

/**
 * Provider-agnostic context window management.
 *
 * Each adapter translates this to the provider's native mechanism:
 *
 * **Gemini** → `contextWindowCompression` (sliding window):
 *   - 128k context. Without compression, sessions cap at ~15 min audio / ~2 min video.
 *   - With compression enabled (default), sessions run indefinitely.
 *   - `triggerTokens` → `contextWindowCompression.triggerTokens`
 *   - `retentionRatio` → `slidingWindow.targetTokens` (as fraction of triggerTokens)
 *
 * **OpenAI** → `truncation` (session.update):
 *   - 32k context, auto-truncates oldest messages at ~28k.
 *   - `retentionRatio` → `truncation: { type: 'retention_ratio', retention_ratio }`
 *     (optimizes prompt caching by truncating more at once)
 *   - `triggerTokens` → not configurable (server-managed)
 */
export interface ContextManagement {
  /**
   * `'auto'` — Provider handles truncation automatically (default).
   * `'disabled'` — No truncation; errors when context is full.
   *    Gemini: sessions limited to ~15 min. OpenAI: errors at 28k tokens.
   */
  readonly mode?: 'auto' | 'disabled';

  /**
   * Token count that triggers context compression/truncation.
   *
   * - **Gemini**: maps to `contextWindowCompression.triggerTokens`
   *   (default: ~80% of 128k = ~102,400)
   * - **OpenAI**: ignored (server auto-triggers at ~28k)
   */
  readonly triggerTokens?: number;

  /**
   * Fraction of context to retain after truncation (0–1).
   *
   * - **OpenAI**: maps to `truncation.retention_ratio` (e.g. 0.8 = keep 80%).
   *   Triggers the `retention_ratio` strategy which optimizes prompt caching.
   * - **Gemini**: maps to `slidingWindow.targetTokens` as a ratio of `triggerTokens`.
   *   (e.g. 0.5 = keep half the context after compression)
   *
   * If not set, providers use their defaults.
   */
  readonly retentionRatio?: number;
}

export interface ConnectOptions {
  readonly getCredentials: () => Promise<string>;
  readonly agent: AgentConfig;
  readonly audioElement?: HTMLAudioElement;
  readonly context?: Readonly<Record<string, unknown>>;
  /** Pass an existing MediaStream (e.g. with video) instead of requesting a new one */
  readonly mediaStream?: MediaStream;
  /**
   * Pre-seed the session with previous conversation turns.
   *
   * - **OpenAI**: Creates `conversation.item.create` events before the first response.
   * - **Gemini**: Sends turns via `sendClientContent` to prime the model context.
   */
  readonly history?: readonly HistoryEntry[];
  /** Provider-specific session overrides such as OpenAI guardrails or Gemini live config. */
  readonly providerOptions?: ProviderOptionsMap;
}

// ── Event Handlers ──

export interface TransportEventHandlers {
  readonly onStatusChange: (status: SessionStatus) => void;
  readonly onAgentStatusChange: (status: AgentStatus) => void;
  readonly onError: (error: Error) => void;
  readonly onTranscriptDelta: (itemId: string, delta: string) => void;
  readonly onTranscriptComplete: (entry: TranscriptEntry) => void;
  readonly onAgentHandoff?: (agentName: string) => void;
  readonly onToolStart?: (toolName: string, args: unknown) => void;
  readonly onToolEnd?: (toolName: string, result: unknown) => void;
  readonly onUserSpeechStart?: () => void;
  readonly onUserSpeechStop?: () => void;
  readonly onTransportEvent?: (event: Readonly<{ type: string; [key: string]: unknown }>) => void;
  readonly onGuardrailTripped?: (result: unknown) => void;
  readonly onToolApprovalRequest?: (toolName: string, args: unknown) => Promise<boolean>;
  readonly onUsageUpdate?: (usage: UsageInfo) => void;
}

// ── Reconnection ──

/**
 * Configuration for automatic session reconnection.
 *
 * Used by `useAutoReconnect` to control retry behavior when the session
 * disconnects unexpectedly (network drop, server restart, etc.).
 */
export interface ReconnectConfig {
  /** Maximum reconnection attempts before giving up (default: 3) */
  readonly maxAttempts?: number;
  /** Initial delay in ms before first retry (default: 1000) */
  readonly baseDelay?: number;
  /** Maximum delay in ms with exponential backoff (default: 8000) */
  readonly maxDelay?: number;
  /**
   * Whether to re-inject transcript history on reconnect (default: true).
   *
   * When enabled, accumulated transcripts from the disconnected session are
   * passed as `history` on reconnect so the agent has conversational context.
   * Gemini sessions using `prepareReconnect()` may not need this since session
   * resumption preserves full context server-side.
   */
  readonly injectHistory?: boolean;
  /**
   * Ref to the current MediaStream — read at reconnect time so the
   * reconnected session uses the latest mic stream (which may have been
   * hot-swapped via `replaceAudioTrack`).
   */
  readonly mediaStreamRef?: Readonly<{ current: MediaStream | null }>;
}

// ── Adapter Interface ──

/**
 * The adapter interface that providers must implement.
 *
 * Each provider (OpenAI, Gemini, etc.) implements this interface to normalize
 * transport-specific behavior behind a common API.
 */
export interface RealtimeAdapter {
  connect(options: ConnectOptions, handlers: TransportEventHandlers): Promise<void>;
  disconnect(): void;
  sendMessage(text: string): void;
  sendImage(dataUrl: string, options?: { triggerResponse?: boolean }): void;
  mute(muted: boolean): void;
  interrupt(): void;
  pushToTalkStart(): void;
  pushToTalkStop(): void;
  sendRawEvent(event: unknown): void;
  sendSimulatedUserMessage(text: string, options?: { triggerResponse?: boolean }): void;
  getUsage(): UsageInfo | null;
  readonly providerName: string;

  /**
   * Update the session configuration mid-session.
   * Supported fields vary by provider — turn detection, noise reduction, tools, instructions.
   * Voice and model cannot be changed after the session starts.
   */
  updateSessionConfig?(config: Record<string, unknown>): void;

  /**
   * Hot-swap the audio input track on an active session.
   *
   * - **OpenAI (WebRTC)**: Replaces the audio track on the RTCPeerConnection sender.
   * - **OpenAI (WebSocket)**: Reconnects the AudioWorklet input source.
   * - **Gemini**: Reconnects the AudioWorklet input source.
   */
  replaceAudioTrack?(newStream: MediaStream): Promise<void>;

  /**
   * Optional: prepare the adapter for reconnection.
   *
   * Called by `useAutoReconnect` before each retry attempt. Adapters can use
   * this to configure provider-specific reconnection strategies:
   *
   * - **Gemini**: Sets `sessionResumption.handle` from the last received handle
   *   so the reconnected session resumes where it left off.
   * - **OpenAI**: No-op (OpenAI has no session resumption; history injection
   *   is handled at the hook level).
   */
  prepareReconnect?(): void;
}

// ── Session Callbacks ──

export interface SessionCallbacks {
  readonly onStatusChange?: (status: SessionStatus) => void;
  readonly onAgentStatusChange?: (status: AgentStatus) => void;
  readonly onError?: (error: Error | string) => void;
  readonly onAgentHandoff?: (agentName: string) => void;
  readonly onToolApprovalRequest?: (toolName: string, args: unknown) => Promise<boolean>;
  readonly onToolStart?: (toolName: string, args: unknown) => void;
  readonly onToolEnd?: (toolName: string, result: unknown) => void;
  readonly onTranscriptComplete?: (entry: TranscriptEntry) => void;
  readonly onUserSpeechStart?: () => void;
  readonly onUserSpeechStop?: () => void;
  readonly onUsageUpdate?: (usage: UsageInfo) => void;
  readonly onTransportEvent?: (event: Readonly<{ type: string; [key: string]: unknown }>) => void;
  readonly onGuardrailTripped?: (result: unknown) => void;
}

// ── Hook Return Type ──

export interface UseRealtimeSessionReturn {
  readonly status: SessionStatus;
  readonly agentStatus: AgentStatus;
  readonly connect: (options: ConnectOptions) => Promise<void>;
  readonly disconnect: () => void;
  readonly sendMessage: (text: string) => void;
  readonly sendImage: (dataUrl: string, options?: { triggerResponse?: boolean }) => void;
  readonly mute: (muted: boolean) => void;
  readonly interrupt: () => void;
  readonly pushToTalkStart: () => void;
  readonly pushToTalkStop: () => void;
  readonly sendEvent: (event: unknown) => void;
  readonly sendSimulatedUserMessage: (text: string, options?: { triggerResponse?: boolean }) => void;
  readonly getUsage: () => UsageInfo | null;
  /** Update session config mid-session (turn detection, noise reduction, etc.) */
  readonly updateSessionConfig: (config: Record<string, unknown>) => void;
  /** Hot-swap the audio input track on an active session */
  readonly replaceAudioTrack: (newStream: MediaStream) => Promise<void>;
  /** Reactive usage state — updates in real-time as tokens are consumed */
  readonly usage: UsageInfo | null;
}

// ── Auto-Reconnect Hook Types ──

/**
 * Extended callbacks for `useAutoReconnect` — includes all `SessionCallbacks`
 * plus reconnection lifecycle events.
 */
export interface AutoReconnectCallbacks extends SessionCallbacks {
  /** Fired before each reconnection attempt. */
  readonly onReconnecting?: (attempt: number, maxAttempts: number) => void;
  /** Fired when reconnection succeeds. */
  readonly onReconnected?: () => void;
  /** Fired when all reconnection attempts are exhausted. */
  readonly onReconnectFailed?: (error: Error) => void;
}

/**
 * Return type for `useAutoReconnect` — extends `UseRealtimeSessionReturn`
 * with reconnection state.
 */
export interface UseAutoReconnectReturn extends UseRealtimeSessionReturn {
  /** Whether a reconnection is currently in progress */
  readonly isReconnecting: boolean;
  /** Current reconnection attempt (0 = not reconnecting) */
  readonly reconnectAttempt: number;
}
