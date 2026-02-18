/**
 * @classytic/realtime-agents/openai - Model Constants
 *
 * Supported models for OpenAI Realtime API.
 * Source: OpenAI Agents SDK — openaiRealtimeBase.ts
 */

export interface OpenAIRealtimeModel {
  readonly id: string;
  readonly name: string;
  readonly description: string;
}

/**
 * Production-ready realtime models.
 *
 * `gpt-realtime` is the default and recommended model — it auto-routes to
 * the latest stable version. Use dated variants only when you need
 * reproducible behaviour pinned to a specific release.
 */
export const OPENAI_REALTIME_MODELS: readonly OpenAIRealtimeModel[] = [
  { id: 'gpt-realtime', name: 'GPT Realtime', description: 'Latest stable (auto-routes)' },
  { id: 'gpt-realtime-2025-08-28', name: 'GPT Realtime (2025-08-28)', description: 'Pinned release' },
  { id: 'gpt-realtime-mini', name: 'GPT Realtime Mini', description: 'Smaller, faster, lower cost' },
  { id: 'gpt-realtime-mini-2025-10-06', name: 'GPT Realtime Mini (2025-10-06)', description: 'Pinned mini release' },
  { id: 'gpt-4o-realtime-preview', name: 'GPT-4o Realtime', description: 'GPT-4o class realtime' },
  { id: 'gpt-4o-mini-realtime-preview', name: 'GPT-4o Mini Realtime', description: 'GPT-4o mini class realtime' },
] as const;

export const OPENAI_DEFAULT_MODEL = 'gpt-realtime';

/** Transcription models supported by the Realtime API */
export const OPENAI_TRANSCRIPTION_MODELS = [
  'gpt-4o-mini-transcribe',
] as const;

export const OPENAI_DEFAULT_TRANSCRIPTION_MODEL = 'gpt-4o-mini-transcribe';

/** Supported transport protocols for OpenAI Realtime */
export type OpenAITransport = 'webrtc' | 'websocket';

export const OPENAI_TRANSPORTS: readonly { id: OpenAITransport; name: string; description: string }[] = [
  { id: 'webrtc', name: 'WebRTC', description: 'Browser audio/video with automatic mic/speaker handling' },
  { id: 'websocket', name: 'WebSocket', description: 'Raw WebSocket — audio must be handled separately (Node.js compatible)' },
] as const;

export const OPENAI_DEFAULT_TRANSPORT: OpenAITransport = 'webrtc';

export type OpenAIRealtimeModelId = (typeof OPENAI_REALTIME_MODELS)[number]['id'];
