'use client';

/**
 * @classytic/realtime-agents - useAutoReconnect
 *
 * Drop-in replacement for `useRealtimeSession` that adds automatic
 * reconnection with exponential backoff on unexpected disconnects.
 *
 * - Detects intentional vs unexpected disconnects
 * - Exponential backoff with jitter (1s → 2s → 4s → 8s cap)
 * - Re-injects transcript history on reconnect (OpenAI)
 * - Calls adapter.prepareReconnect() for provider-specific resume (Gemini)
 * - Exposes `isReconnecting` and `reconnectAttempt` for UI feedback
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  RealtimeAdapter,
  ConnectOptions,
  SessionStatus,
  HistoryEntry,
  AutoReconnectCallbacks,
  ReconnectConfig,
  UseAutoReconnectReturn,
} from './types.js';
import { useRealtimeSession } from './use-realtime-session.js';

/** Calculate exponential backoff with jitter */
function getBackoffDelay(attempt: number, baseDelay: number, maxDelay: number): number {
  const exponential = baseDelay * Math.pow(2, attempt - 1);
  const capped = Math.min(exponential, maxDelay);
  // Add ±25% jitter to prevent thundering herd
  const jitter = capped * (0.75 + Math.random() * 0.5);
  return Math.round(jitter);
}

/** Promisified setTimeout */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Auto-reconnecting voice agent session hook.
 *
 * Drop-in replacement for `useRealtimeSession` — same API, plus reconnection.
 *
 * @example
 * ```typescript
 * import { useAutoReconnect } from '@classytic/realtime-agents';
 * import { OpenAIAdapter } from '@classytic/realtime-agents/openai';
 *
 * const adapter = useMemo(() => new OpenAIAdapter(), []);
 * const session = useAutoReconnect(adapter, {
 *   onError: (err) => console.error(err),
 *   onReconnecting: (attempt, max) => toast.info(`Reconnecting ${attempt}/${max}...`),
 *   onReconnected: () => toast.success('Reconnected!'),
 *   onReconnectFailed: () => toast.error('Connection lost'),
 * }, { maxAttempts: 3 });
 *
 * // Same controls as useRealtimeSession:
 * await session.connect({ getCredentials, agent });
 * session.isReconnecting // boolean
 * session.reconnectAttempt // 0 when not reconnecting
 * ```
 */
export function useAutoReconnect(
  adapter: RealtimeAdapter,
  callbacks: AutoReconnectCallbacks = {},
  config: ReconnectConfig = {},
): UseAutoReconnectReturn {
  const {
    maxAttempts = 3,
    baseDelay = 1000,
    maxDelay = 8000,
    injectHistory = true,
    mediaStreamRef,
  } = config;

  // ── Reconnection state ──
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [reconnectAttempt, setReconnectAttempt] = useState(0);

  // ── Refs for stable access across closures ──
  const intentionalRef = useRef(false);
  const reconnectingRef = useRef(false);
  const mountedRef = useRef(true);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastConnectOptionsRef = useRef<ConnectOptions | null>(null);
  const adapterRef = useRef(adapter);
  adapterRef.current = adapter;

  // Stable ref for callbacks to avoid stale closures
  const callbacksRef = useRef(callbacks);
  callbacksRef.current = callbacks;

  // Stable ref for config values
  const configRef = useRef({ maxAttempts, baseDelay, maxDelay, injectHistory, mediaStreamRef });
  configRef.current = { maxAttempts, baseDelay, maxDelay, injectHistory, mediaStreamRef };

  // ── Transcript accumulator for history injection ──
  const transcriptRef = useRef<HistoryEntry[]>([]);

  // ── Core reconnection logic ──

  const clearReconnectTimer = useCallback(() => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
  }, []);

  /**
   * Attempt reconnection with exponential backoff.
   * Called automatically on unexpected disconnect.
   */
  const attemptReconnect = useCallback(
    async (sessionObj: { connect: (opts: ConnectOptions) => Promise<void>; disconnect: () => void }) => {
      if (reconnectingRef.current || intentionalRef.current) return;
      if (!lastConnectOptionsRef.current) return;

      reconnectingRef.current = true;
      setIsReconnecting(true);

      const cfg = configRef.current;

      for (let attempt = 1; attempt <= cfg.maxAttempts; attempt++) {
        if (!mountedRef.current || intentionalRef.current) {
          reconnectingRef.current = false;
          setIsReconnecting(false);
          return;
        }

        setReconnectAttempt(attempt);
        callbacksRef.current.onReconnecting?.(attempt, cfg.maxAttempts);

        // Wait with backoff before retry
        const backoff = getBackoffDelay(attempt, cfg.baseDelay, cfg.maxDelay);
        await delay(backoff);

        if (!mountedRef.current || intentionalRef.current) {
          reconnectingRef.current = false;
          setIsReconnecting(false);
          return;
        }

        // Let the adapter prepare for reconnection (e.g. Gemini session resumption)
        try {
          adapterRef.current.prepareReconnect?.();
        } catch {
          // Non-critical — continue with reconnection
        }

        // Build reconnect options — optionally inject accumulated transcript
        const savedOptions = lastConnectOptionsRef.current!;
        let reconnectOptions = savedOptions;

        // Use the latest media stream from the ref if available
        const currentStream = cfg.mediaStreamRef?.current;
        if (currentStream) {
          reconnectOptions = { ...reconnectOptions, mediaStream: currentStream };
        }

        if (cfg.injectHistory && transcriptRef.current.length > 0) {
          // Merge: original history + accumulated transcript
          const existingHistory = savedOptions.history ?? [];
          reconnectOptions = {
            ...reconnectOptions,
            history: [...existingHistory, ...transcriptRef.current],
          };
        }

        try {
          await sessionObj.connect(reconnectOptions);

          // Success — reconnection worked
          reconnectingRef.current = false;
          setIsReconnecting(false);
          setReconnectAttempt(0);
          callbacksRef.current.onReconnected?.();
          return;
        } catch {
          // Failed — will retry if attempts remain
          console.warn(
            `[useAutoReconnect] Attempt ${attempt}/${cfg.maxAttempts} failed`,
          );
        }
      }

      // All attempts exhausted
      reconnectingRef.current = false;
      setIsReconnecting(false);
      setReconnectAttempt(0);
      callbacksRef.current.onReconnectFailed?.(
        new Error(`Reconnection failed after ${cfg.maxAttempts} attempts`),
      );
    },
    [],
  );

  // ── Wrapped callbacks — intercept status changes and transcripts ──

  const wrappedCallbacks = useRef<AutoReconnectCallbacks>({}).current;

  // Update wrapped callbacks each render (SessionCallbacks are read during connect)
  Object.assign(wrappedCallbacks, callbacks, {
    onStatusChange: (status: SessionStatus) => {
      callbacksRef.current.onStatusChange?.(status);

      // Detect unexpected disconnect → trigger reconnection
      if (
        status === 'disconnected' &&
        !intentionalRef.current &&
        !reconnectingRef.current &&
        lastConnectOptionsRef.current
      ) {
        // Use a microtask to allow the session's internal cleanup to finish
        queueMicrotask(() => {
          attemptReconnect(sessionRef.current);
        });
      }
    },
    onTranscriptComplete: (entry: { role: 'user' | 'assistant'; text: string; itemId: string }) => {
      callbacksRef.current.onTranscriptComplete?.(entry);

      // Accumulate transcript for history injection on reconnect
      if (entry.text) {
        transcriptRef.current.push({ role: entry.role, text: entry.text });
        // Cap at last 50 turns to prevent unbounded growth
        if (transcriptRef.current.length > 50) {
          transcriptRef.current = transcriptRef.current.slice(-50);
        }
      }
    },
  });

  // ── Inner session (delegates to useRealtimeSession) ──
  const innerSession = useRealtimeSession(adapter, wrappedCallbacks);

  // Ref to the session for stable access in attemptReconnect
  const sessionRef = useRef(innerSession);
  sessionRef.current = innerSession;

  // ── Wrapped connect/disconnect ──

  const connect = useCallback(
    async (options: ConnectOptions) => {
      intentionalRef.current = false;
      reconnectingRef.current = false;
      lastConnectOptionsRef.current = options;
      transcriptRef.current = [];
      clearReconnectTimer();
      setIsReconnecting(false);
      setReconnectAttempt(0);
      await innerSession.connect(options);
    },
    [innerSession, clearReconnectTimer],
  );

  const disconnect = useCallback(() => {
    intentionalRef.current = true;
    reconnectingRef.current = false;
    clearReconnectTimer();
    setIsReconnecting(false);
    setReconnectAttempt(0);
    innerSession.disconnect();
  }, [innerSession, clearReconnectTimer]);

  // ── Cleanup on unmount ──
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      clearReconnectTimer();
    };
  }, [clearReconnectTimer]);

  return {
    ...innerSession,
    connect,
    disconnect,
    isReconnecting,
    reconnectAttempt,
  };
}
