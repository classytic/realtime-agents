/**
 * @classytic/realtime-agents/openai - Reusable configuration presets
 */

import type { ContextManagement } from '../types.js';
import type {
  OpenAISessionProviderOptions,
} from './types.js';

export const OPENAI_DEFAULT_CONTEXT_MANAGEMENT: Readonly<ContextManagement> = {
  mode: 'auto',
  retentionRatio: 0.8,
};

export const OPENAI_LOW_LATENCY_CONTEXT_MANAGEMENT: Readonly<ContextManagement> = {
  mode: 'auto',
  retentionRatio: 0.7,
};

export const OPENAI_DEFAULT_TRANSCRIPTION_CONFIG = Object.freeze({
  model: 'gpt-4o-mini-transcribe',
});

export const OPENAI_HIGH_ACCURACY_TRANSCRIPTION_CONFIG = Object.freeze({
  model: 'gpt-4o-transcribe',
});

export const OPENAI_INTERVIEW_TRANSCRIPTION_CONFIG = Object.freeze({
  model: 'gpt-4o-transcribe',
  prompt:
    'Interview transcript. Preserve technical terms, names, product names, company names, Indian names, and mixed English or Hindi phrasing exactly when possible.',
});

export const OPENAI_DEFAULT_TURN_DETECTION = Object.freeze({
  type: 'semantic_vad',
  eagerness: 'medium',
  createResponse: true,
  interruptResponse: true,
});

export const OPENAI_LOW_LATENCY_TURN_DETECTION = Object.freeze({
  type: 'semantic_vad',
  eagerness: 'high',
  createResponse: true,
  interruptResponse: true,
});

export const OPENAI_DEFAULT_SESSION_OPTIONS: Readonly<OpenAISessionProviderOptions> = {
  sessionConfig: {
    outputModalities: ['audio'],
    audio: {
      input: {
        transcription: OPENAI_DEFAULT_TRANSCRIPTION_CONFIG,
        turnDetection: OPENAI_DEFAULT_TURN_DETECTION,
      },
    },
  },
};

export const OPENAI_LOW_LATENCY_SESSION_OPTIONS: Readonly<OpenAISessionProviderOptions> = {
  sessionConfig: {
    outputModalities: ['audio'],
    audio: {
      input: {
        transcription: OPENAI_DEFAULT_TRANSCRIPTION_CONFIG,
        turnDetection: OPENAI_LOW_LATENCY_TURN_DETECTION,
      },
    },
  },
};

export const OPENAI_HIGH_ACCURACY_SESSION_OPTIONS: Readonly<OpenAISessionProviderOptions> = {
  sessionConfig: {
    outputModalities: ['audio'],
    audio: {
      input: {
        transcription: OPENAI_HIGH_ACCURACY_TRANSCRIPTION_CONFIG,
        turnDetection: OPENAI_DEFAULT_TURN_DETECTION,
      },
    },
  },
};

/**
 * Accent and language style remain prompt-level controls.
 * These hints are intended to be inserted into your agent instructions.
 */
export const OPENAI_SPEECH_STYLE_HINTS = Object.freeze({
  'en-IN':
    'Speak in clear Indian English with a natural Indian cadence. Keep pronunciation crisp and professional.',
  'hi-IN':
    'Speak in natural Hindi for India with clear, professional diction and short spoken turns.',
  'bn-BD':
    'Speak in natural Bengali for Bangladesh with clear pronunciation and a calm professional tone.',
});
