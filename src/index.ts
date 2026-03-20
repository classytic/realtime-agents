/**
 * @classytic/realtime-agents
 *
 * Provider-agnostic realtime voice agent orchestration for React.
 *
 * Providers are imported via subpath exports:
 *   import { OpenAIAdapter } from '@classytic/realtime-agents/openai';
 *   import { GeminiAdapter } from '@classytic/realtime-agents/gemini';
 */

// ── Types ──
export type {
  SessionStatus,
  AgentStatus,
  TranscriptEntry,
  AgentTool,
  AgentConfig,
  ProviderOptionsMap,
  HistoryEntry,
  ConnectOptions,
  TransportEventHandlers,
  RealtimeAdapter,
  SessionCallbacks,
  UseRealtimeSessionReturn,
  UsageInfo,
  ContextManagement,
  ReconnectConfig,
  AutoReconnectCallbacks,
  UseAutoReconnectReturn,
} from './types.js';

export type {
  ModerationCategory,
  GuardrailResultType,
  TranscriptItem,
  LoggedEvent,
} from './context-types.js';

export type { ToolContext } from './tool-context.js';

// ── Core ──
export { tool } from './tools.js';
export { setToolContext, clearToolContext, getToolContext } from './tool-context.js';
export { buildInstructions } from './build-instructions.js';

// ── Hooks ──
export { useRealtimeSession } from './use-realtime-session.js';
export { useAutoReconnect } from './use-auto-reconnect.js';
export { useSessionHistory } from './use-session-history.js';

// ── Session Control ──
export { SessionControl, SESSION_CONTROL_DEFAULTS } from './session-control.js';
export { useSessionControl } from './use-session-control.js';
export type {
  SessionControlState,
  SessionControlActions,
  EagernessLevel,
  NoiseReductionMode,
  OutputModality,
} from './session-control.js';
export type { UseSessionControlReturn } from './use-session-control.js';

// ── Context Providers ──
export { EventProvider, useEvent } from './event-context.js';
export { TranscriptProvider, useTranscript } from './transcript-context.js';
