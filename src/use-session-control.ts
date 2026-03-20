'use client';

/**
 * useSessionControl — React hook for unified session configuration.
 *
 * Wraps `SessionControl` with React state so changes trigger re-renders.
 * Automatically connects to the adapter's `updateSessionConfig` when the
 * session is connected (OpenAI), or builds deferred config for `connect()`
 * providerOptions (Gemini).
 *
 * @example
 * ```tsx
 * const adapter = useMemo(() => new OpenAIAdapter(), []);
 * const { status, connect, ...session } = useRealtimeSession(adapter, callbacks);
 * const control = useSessionControl(adapter, session.updateSessionConfig, status);
 *
 * // These apply immediately when connected (OpenAI), or are deferred (Gemini)
 * control.setInterruptible(false);
 * control.setEagerness('low');
 *
 * // Pass to connect() for initial config
 * await connect({
 *   ...options,
 *   providerOptions: control.toProviderOptions(),
 * });
 * ```
 */

import { useState, useCallback, useRef, useMemo } from 'react';
import {
  SessionControl,
  SESSION_CONTROL_DEFAULTS,
  toOpenAIConfig,
  toGeminiConnectConfig,
} from './session-control.js';
import type {
  SessionControlState,
  EagernessLevel,
  NoiseReductionMode,
  OutputModality,
} from './session-control.js';
import type { RealtimeAdapter, SessionStatus, ProviderOptionsMap } from './types.js';

export interface UseSessionControlReturn {
  /** Current control state (reactive) */
  readonly state: Readonly<SessionControlState>;
  /** Set whether AI can be interrupted while speaking */
  readonly setInterruptible: (enabled: boolean) => void;
  /** Set VAD eagerness level */
  readonly setEagerness: (level: EagernessLevel) => void;
  /** Set whether AI responds automatically after user stops speaking */
  readonly setAutoRespond: (enabled: boolean) => void;
  /** Set server-side noise reduction mode */
  readonly setNoiseReduction: (mode: NoiseReductionMode) => void;
  /** Set output modalities */
  readonly setOutputModalities: (modalities: OutputModality[]) => void;
  /** Reset all settings to defaults */
  readonly reset: () => void;
  /**
   * Get provider options for `connect()`.
   * Includes the current session control config mapped to the adapter's provider.
   */
  readonly toProviderOptions: () => ProviderOptionsMap | undefined;
}

export function useSessionControl(
  adapter: RealtimeAdapter,
  updateSessionConfig: (config: Record<string, unknown>) => void,
  status: SessionStatus,
  initialState?: Partial<SessionControlState>,
): UseSessionControlReturn {
  const [state, setState] = useState<SessionControlState>({
    ...SESSION_CONTROL_DEFAULTS,
    ...initialState,
  });

  const providerName = adapter.providerName as 'openai' | 'gemini';
  const isConnected = status === 'connected';
  const updateRef = useRef(updateSessionConfig);
  updateRef.current = updateSessionConfig;

  // Create control instance that applies changes immediately for OpenAI
  const control = useMemo(() => {
    return new SessionControl({
      applyToOpenAI:
        providerName === 'openai'
          ? (config) => {
              if (isConnected) {
                updateRef.current(config);
              }
            }
          : undefined,
      onStateChange: (newState) => setState({ ...newState }),
      initialState: { ...SESSION_CONTROL_DEFAULTS, ...initialState },
    });
    // Re-create when provider or connection status changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [providerName, isConnected]);

  const setInterruptible = useCallback(
    (enabled: boolean) => control.setInterruptible(enabled),
    [control],
  );
  const setEagerness = useCallback(
    (level: EagernessLevel) => control.setEagerness(level),
    [control],
  );
  const setAutoRespond = useCallback(
    (enabled: boolean) => control.setAutoRespond(enabled),
    [control],
  );
  const setNoiseReduction = useCallback(
    (mode: NoiseReductionMode) => control.setNoiseReduction(mode),
    [control],
  );
  const setOutputModalities = useCallback(
    (modalities: OutputModality[]) => control.setOutputModalities(modalities),
    [control],
  );
  const reset = useCallback(() => control.reset(), [control]);

  const toProviderOptions = useCallback((): ProviderOptionsMap | undefined => {
    if (providerName === 'openai') {
      // providerOptions for connect() use camelCase (SDK handles conversion)
      return {
        openai: {
          sessionConfig: {
            audio: {
              input: {
                turnDetection: {
                  type: 'semantic_vad' as const,
                  eagerness: state.eagerness,
                  createResponse: state.autoRespond,
                  interruptResponse: state.interruptible,
                },
                noiseReduction:
                  state.noiseReduction === 'off'
                    ? null
                    : { type: state.noiseReduction },
              },
            },
            outputModalities: state.outputModalities,
          },
        },
      };
    }

    if (providerName === 'gemini') {
      return {
        gemini: {
          realtimeInputConfig: toGeminiConnectConfig(state).realtimeInputConfig,
          responseModalities: toGeminiConnectConfig(state).responseModalities,
        },
      };
    }

    return undefined;
  }, [providerName, state]);

  return {
    state,
    setInterruptible,
    setEagerness,
    setAutoRespond,
    setNoiseReduction,
    setOutputModalities,
    reset,
    toProviderOptions,
  };
}
