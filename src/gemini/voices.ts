/**
 * @classytic/realtime-agents/gemini - Voice Constants
 *
 * Supported voices for Gemini Live API.
 * Native audio models support additional TTS voices;
 * half-cascade models support these 8 prebuilt voices.
 */

export interface GeminiVoiceOption {
  readonly id: string;
  readonly name: string;
  readonly description: string;
}

export const GEMINI_VOICES: readonly GeminiVoiceOption[] = [
  { id: 'Aoede', name: 'Aoede', description: 'Bright and clear' },
  { id: 'Charon', name: 'Charon', description: 'Deep and resonant' },
  { id: 'Fenrir', name: 'Fenrir', description: 'Warm and grounded' },
  { id: 'Kore', name: 'Kore', description: 'Calm and professional' },
  { id: 'Leda', name: 'Leda', description: 'Gentle and soothing' },
  { id: 'Orus', name: 'Orus', description: 'Confident and articulate' },
  { id: 'Puck', name: 'Puck', description: 'Lively and expressive' },
  { id: 'Zephyr', name: 'Zephyr', description: 'Breezy and natural' },
] as const;

export const GEMINI_DEFAULT_VOICE = 'Kore';

export type GeminiVoiceId = (typeof GEMINI_VOICES)[number]['id'];
