/**
 * SessionControl — Unified, provider-agnostic session configuration.
 *
 * Provides a clean API for controlling turn detection, interrupts, noise
 * reduction, and output modalities across OpenAI and Gemini adapters.
 *
 * - **OpenAI**: Applies changes immediately via `updateSessionConfig()`.
 * - **Gemini**: Stores changes and applies on next `connect()` (Gemini Live
 *   does not support mid-session config updates).
 *
 * @example
 * ```ts
 * const control = useSessionControl(adapter, status);
 *
 * // Make AI non-interruptible (it will finish speaking before listening)
 * control.setInterruptible(false);
 *
 * // Set VAD sensitivity
 * control.setEagerness('low');
 *
 * // Enable server-side noise reduction
 * control.setNoiseReduction('far_field');
 * ```
 */

// ─── Types ───

export type EagernessLevel = 'low' | 'medium' | 'high';
export type NoiseReductionMode = 'off' | 'near_field' | 'far_field';
export type OutputModality = 'text' | 'audio';

export interface SessionControlState {
  /** Whether the AI can be interrupted while speaking */
  interruptible: boolean;
  /** VAD eagerness level */
  eagerness: EagernessLevel;
  /** Whether AI responds automatically after detecting end of speech */
  autoRespond: boolean;
  /** Server-side noise reduction mode */
  noiseReduction: NoiseReductionMode;
  /** Output modalities */
  outputModalities: OutputModality[];
}

export interface SessionControlActions {
  /** Set whether the AI can be interrupted while speaking */
  setInterruptible(enabled: boolean): void;
  /** Set VAD eagerness (how quickly it detects end of speech) */
  setEagerness(level: EagernessLevel): void;
  /** Set whether AI responds automatically after user stops speaking */
  setAutoRespond(enabled: boolean): void;
  /** Set server-side noise reduction mode */
  setNoiseReduction(mode: NoiseReductionMode): void;
  /** Set output modalities */
  setOutputModalities(modalities: OutputModality[]): void;
  /** Get the current config state */
  getState(): Readonly<SessionControlState>;
  /**
   * Get the provider-specific config object for the current state.
   * Use this when you need to pass config to `connect()` providerOptions.
   */
  toProviderConfig(provider: 'openai' | 'gemini'): Record<string, unknown>;
  /** Reset all settings to defaults */
  reset(): void;
}

// ─── Defaults ───

const DEFAULT_STATE: SessionControlState = {
  interruptible: true,
  eagerness: 'medium',
  autoRespond: true,
  noiseReduction: 'off',
  outputModalities: ['audio'],
};

// ─── Provider Config Mappers ───

/**
 * Map unified state to OpenAI RealtimeSessionConfig format (camelCase).
 *
 * Passed to transport.updateSessionConfig() which handles camelCase→snake_case
 * conversion via buildSessionPayload / buildTurnDetectionConfig.
 *
 * @see packages/openai-agents-js — openaiRealtimeBase.ts _getMergedSessionConfig
 */
function toOpenAIConfig(state: SessionControlState): Record<string, unknown> {
  return {
    audio: {
      input: {
        turnDetection: {
          type: 'semantic_vad',
          eagerness: state.eagerness,
          interruptResponse: state.interruptible,
          createResponse: state.autoRespond,
        },
        noiseReduction:
          state.noiseReduction === 'off'
            ? null
            : { type: state.noiseReduction },
      },
    },
    outputModalities: state.outputModalities,
  };
}

function toGeminiConnectConfig(state: SessionControlState): Record<string, unknown> {
  const eagernessToSensitivity = (level: EagernessLevel) => {
    switch (level) {
      case 'high':
        return { startOfSpeechSensitivity: 'START_SENSITIVITY_HIGH', endOfSpeechSensitivity: 'END_SENSITIVITY_HIGH' };
      case 'low':
        return { startOfSpeechSensitivity: 'START_SENSITIVITY_LOW', endOfSpeechSensitivity: 'END_SENSITIVITY_LOW' };
      default:
        return {}; // medium = Gemini defaults
    }
  };

  return {
    realtimeInputConfig: {
      automaticActivityDetection: {
        disabled: false,
        ...eagernessToSensitivity(state.eagerness),
      },
      activityHandling: state.interruptible
        ? 'START_OF_ACTIVITY_INTERRUPTS'
        : 'NO_INTERRUPTION',
    },
    responseModalities: state.outputModalities.map((m) =>
      m === 'text' ? 'TEXT' : 'AUDIO',
    ),
  };
}

// ─── SessionControl Class ───

export class SessionControl implements SessionControlActions {
  private state: SessionControlState;
  private readonly applyToOpenAI: ((config: Record<string, unknown>) => void) | null;
  private readonly onStateChange?: (state: Readonly<SessionControlState>) => void;

  constructor(options: {
    /** Called to apply OpenAI config updates mid-session */
    applyToOpenAI?: (config: Record<string, unknown>) => void;
    /** Called whenever state changes (for React state sync) */
    onStateChange?: (state: Readonly<SessionControlState>) => void;
    /** Initial state override */
    initialState?: Partial<SessionControlState>;
  } = {}) {
    this.state = { ...DEFAULT_STATE, ...options.initialState };
    this.applyToOpenAI = options.applyToOpenAI ?? null;
    this.onStateChange = options.onStateChange;
  }

  private update(partial: Partial<SessionControlState>): void {
    this.state = { ...this.state, ...partial };
    this.onStateChange?.({ ...this.state });

    // Apply immediately to OpenAI if connected
    if (this.applyToOpenAI) {
      this.applyToOpenAI(toOpenAIConfig(this.state));
    }
  }

  setInterruptible(enabled: boolean): void {
    this.update({ interruptible: enabled });
  }

  setEagerness(level: EagernessLevel): void {
    this.update({ eagerness: level });
  }

  setAutoRespond(enabled: boolean): void {
    this.update({ autoRespond: enabled });
  }

  setNoiseReduction(mode: NoiseReductionMode): void {
    this.update({ noiseReduction: mode });
  }

  setOutputModalities(modalities: OutputModality[]): void {
    this.update({ outputModalities: modalities });
  }

  getState(): Readonly<SessionControlState> {
    return { ...this.state };
  }

  toProviderConfig(provider: 'openai' | 'gemini'): Record<string, unknown> {
    if (provider === 'gemini') return toGeminiConnectConfig(this.state);
    return toOpenAIConfig(this.state);
  }

  reset(): void {
    this.update({ ...DEFAULT_STATE });
  }
}

// ─── Exports ───

export { DEFAULT_STATE as SESSION_CONTROL_DEFAULTS };
export { toOpenAIConfig, toGeminiConnectConfig };
