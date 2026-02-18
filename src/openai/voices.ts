/**
 * @classytic/realtime-agents/openai - Voice Constants
 *
 * Supported voices for OpenAI Realtime API.
 */

export interface OpenAIVoiceOption {
  readonly id: string;
  readonly name: string;
  readonly description: string;
}

export const OPENAI_VOICES: readonly OpenAIVoiceOption[] = [
  { id: 'alloy', name: 'Alloy', description: 'Neutral and balanced' },
  { id: 'ash', name: 'Ash', description: 'Soft and thoughtful' },
  { id: 'ballad', name: 'Ballad', description: 'Warm and engaging' },
  { id: 'coral', name: 'Coral', description: 'Clear and informative' },
  { id: 'echo', name: 'Echo', description: 'Smooth and resonant' },
  { id: 'sage', name: 'Sage', description: 'Wise and composed' },
  { id: 'shimmer', name: 'Shimmer', description: 'Bright and energetic' },
  { id: 'verse', name: 'Verse', description: 'Articulate and expressive' },
  { id: 'marin', name: 'Marin', description: 'Calm and professional' },
  { id: 'cedar', name: 'Cedar', description: 'Professional and warm' },
] as const;

export const OPENAI_DEFAULT_VOICE = 'cedar';

export type OpenAIVoiceId = (typeof OPENAI_VOICES)[number]['id'];
