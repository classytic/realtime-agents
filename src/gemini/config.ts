/**
 * @classytic/realtime-agents/gemini - Reusable configuration presets
 */

import { Modality } from '@google/genai';
import type { ContextManagement } from '../types.js';
import type {
  GeminiLiveAudioTranscriptionConfig,
  GeminiLiveSpeechConfig,
  GeminiSessionProviderOptions,
} from './types.js';

export const GEMINI_DEFAULT_CONTEXT_MANAGEMENT: Readonly<ContextManagement> = {
  mode: 'auto',
  retentionRatio: 0.8,
};

export const GEMINI_LOW_LATENCY_CONTEXT_MANAGEMENT: Readonly<ContextManagement> = {
  mode: 'auto',
  retentionRatio: 0.7,
};

export const GEMINI_DEFAULT_AUDIO_TRANSCRIPTION_CONFIG:
Readonly<GeminiLiveAudioTranscriptionConfig> = {};

export const GEMINI_DEFAULT_SPEECH_CONFIG: Readonly<GeminiLiveSpeechConfig> = {};

export const GEMINI_EN_IN_SPEECH_CONFIG: Readonly<GeminiLiveSpeechConfig> = {
  languageCode: 'en-IN',
};

export const GEMINI_HI_IN_SPEECH_CONFIG: Readonly<GeminiLiveSpeechConfig> = {
  languageCode: 'hi-IN',
};

export const GEMINI_BN_BD_SPEECH_CONFIG: Readonly<GeminiLiveSpeechConfig> = {
  languageCode: 'bn-BD',
};

export const GEMINI_DEFAULT_SESSION_OPTIONS: Readonly<GeminiSessionProviderOptions> = {
  responseModalities: [Modality.AUDIO],
  inputAudioTranscription: GEMINI_DEFAULT_AUDIO_TRANSCRIPTION_CONFIG,
  outputAudioTranscription: GEMINI_DEFAULT_AUDIO_TRANSCRIPTION_CONFIG,
};

export const GEMINI_LOW_LATENCY_SESSION_OPTIONS: Readonly<GeminiSessionProviderOptions> = {
  responseModalities: [Modality.AUDIO],
  inputAudioTranscription: GEMINI_DEFAULT_AUDIO_TRANSCRIPTION_CONFIG,
  outputAudioTranscription: false,
};
