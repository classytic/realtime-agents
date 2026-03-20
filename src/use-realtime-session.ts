'use client';

/**
 * @classytic/realtime-agents - useRealtimeSession
 *
 * Provider-agnostic hook for managing realtime voice agent sessions.
 * Accepts a RealtimeAdapter and delegates transport operations to it,
 * while managing shared state (status, callbacks, transcript sync, tool context).
 */

import { useCallback, useRef, useState } from 'react';
import type {
  RealtimeAdapter,
  SessionStatus,
  AgentStatus,
  ConnectOptions,
  SessionCallbacks,
  TransportEventHandlers,
  UseRealtimeSessionReturn,
  UsageInfo,
} from './types.js';
import { useEvent } from './event-context.js';
import { useSessionHistory } from './use-session-history.js';
import { setToolContext, clearToolContext } from './tool-context.js';
import { extractMessageText } from './utils.js';

/**
 * Provider-agnostic voice agent session hook.
 *
 * @example
 * ```typescript
 * import { useRealtimeSession, tool } from '@classytic/realtime-agents';
 * import { OpenAIAdapter } from '@classytic/realtime-agents/openai';
 *
 * const adapter = useMemo(() => new OpenAIAdapter(), []);
 * const { status, connect, disconnect, mute } = useRealtimeSession(adapter, {
 *   onError: console.error,
 * });
 * ```
 */
export function useRealtimeSession(
  adapter: RealtimeAdapter,
  callbacks: SessionCallbacks = {},
): UseRealtimeSessionReturn {
  const adapterRef = useRef(adapter);
  adapterRef.current = adapter;

  // Store callbacks in a ref to avoid invalidating every useCallback
  // downstream when the consumer passes a new object literal each render.
  const callbacksRef = useRef(callbacks);
  callbacksRef.current = callbacks;

  const [status, setStatus] = useState<SessionStatus>('disconnected');
  const [agentStatus, setAgentStatus] = useState<AgentStatus>('idle');
  const [usage, setUsage] = useState<UsageInfo | null>(null);
  const { logClientEvent, logServerEvent } = useEvent();

  const historyRef = useSessionHistory();

  // Track saved transcripts to prevent duplicates
  const savedTranscriptIds = useRef<Set<string>>(new Set());

  const updateStatus = useCallback(
    (newStatus: SessionStatus) => {
      setStatus(newStatus);
      callbacksRef.current.onStatusChange?.(newStatus);
      logClientEvent({}, newStatus.toUpperCase());
    },
    [logClientEvent],
  );

  const updateAgentStatus = useCallback(
    (newStatus: AgentStatus) => {
      setAgentStatus(newStatus);
      callbacksRef.current.onAgentStatusChange?.(newStatus);
    },
    [],
  );

  const connect = useCallback(
    async (options: ConnectOptions) => {
      updateStatus('connecting');
      savedTranscriptIds.current.clear();

      try {
        const handlers: TransportEventHandlers = {
          onStatusChange: updateStatus,
          onAgentStatusChange: updateAgentStatus,
          onError: (e) => {
            logServerEvent({ type: 'error', message: e.message });
            callbacksRef.current.onError?.(e);
          },
          onTranscriptDelta: (itemId, delta) => {
            historyRef.current.handleTranscriptionDelta({ item_id: itemId, delta });
          },
          onTranscriptComplete: (entry) => {
            callbacksRef.current.onTranscriptComplete?.(entry);
          },
          onAgentHandoff: callbacksRef.current.onAgentHandoff,
          onToolStart: (toolName, args) => {
            callbacksRef.current.onToolStart?.(toolName, args);
            historyRef.current.handleAgentToolStart(
              {},
              null,
              { name: toolName, arguments: args },
            );
          },
          onToolEnd: (toolName, result) => {
            callbacksRef.current.onToolEnd?.(toolName, result);
            historyRef.current.handleAgentToolEnd(
              {},
              null,
              { name: toolName },
              result,
            );
          },
          onUserSpeechStart: callbacksRef.current.onUserSpeechStart,
          onUserSpeechStop: callbacksRef.current.onUserSpeechStop,
          onTransportEvent: (event) => {
            callbacksRef.current.onTransportEvent?.(event);
            // Handle transcript events from transport
            if (event.type === 'conversation.item.input_audio_transcription.completed') {
              historyRef.current.handleTranscriptionCompleted(event);
              if (callbacksRef.current.onTranscriptComplete && event.transcript) {
                callbacksRef.current.onTranscriptComplete({
                  role: 'user',
                  text: String(event.transcript),
                  itemId: String(event.item_id || ''),
                });
              }
            } else if (event.type === 'response.audio_transcript.done') {
              historyRef.current.handleTranscriptionCompleted(event);
              if (callbacksRef.current.onTranscriptComplete && event.transcript) {
                callbacksRef.current.onTranscriptComplete({
                  role: 'assistant',
                  text: String(event.transcript),
                  itemId: String(event.item_id || ''),
                });
              }
            } else if (event.type === 'response.audio_transcript.delta') {
              historyRef.current.handleTranscriptionDelta(event);
            } else if (event.type === 'history_added') {
              const item = event.item as Record<string, unknown>;
              if (item) {
                historyRef.current.handleHistoryAdded(item);
                // Also fire onTranscriptComplete for assistant messages
                if (item.type === 'message' && item.role === 'assistant' && item.itemId) {
                  const text = extractMessageText(item.content as unknown[]);
                  if (text && !savedTranscriptIds.current.has(item.itemId as string)) {
                    savedTranscriptIds.current.add(item.itemId as string);
                    callbacksRef.current.onTranscriptComplete?.({
                      role: 'assistant',
                      text,
                      itemId: String(item.itemId),
                    });
                  }
                }
              }
            } else if (event.type === 'history_updated') {
              const items = event.items as Record<string, unknown>[];
              if (items) {
                historyRef.current.handleHistoryUpdated(items);
                items.forEach((item) => {
                  if (item.type === 'message' && item.role === 'assistant' && item.itemId) {
                    const text = extractMessageText(item.content as unknown[]);
                    if (text && !savedTranscriptIds.current.has(item.itemId as string)) {
                      savedTranscriptIds.current.add(item.itemId as string);
                      callbacksRef.current.onTranscriptComplete?.({
                        role: 'assistant',
                        text,
                        itemId: String(item.itemId),
                      });
                    }
                  }
                });
              }
            } else {
              logServerEvent(event as Record<string, unknown>);
            }
          },
          onGuardrailTripped: (result) => {
            callbacksRef.current.onGuardrailTripped?.(result);
            historyRef.current.handleGuardrailTripped(
              {},
              null,
              { result },
            );
          },
          onToolApprovalRequest: callbacksRef.current.onToolApprovalRequest,
          onUsageUpdate: (u) => {
            setUsage(u);
            callbacksRef.current.onUsageUpdate?.(u);
          },
        };

        await adapterRef.current.connect(options, handlers);

        setToolContext({
          sessionContext: options.context ?? {},
          providerSession: adapterRef.current,
          sendImage: (dataUrl, opts) => adapterRef.current.sendImage(dataUrl, opts),
        });

        updateStatus('connected');
        updateAgentStatus('idle');
      } catch (error) {
        updateStatus('disconnected');
        const err = error instanceof Error ? error : new Error(String(error));
        callbacksRef.current.onError?.(err);
        throw error;
      }
    },
    [updateStatus, updateAgentStatus, logServerEvent],
  );

  const disconnect = useCallback(() => {
    adapterRef.current.disconnect();
    clearToolContext();
    savedTranscriptIds.current.clear();
    updateStatus('disconnected');
    updateAgentStatus('idle');
    // Don't reset usage — keep final values visible after disconnect
  }, [updateStatus, updateAgentStatus]);

  const sendMessage = useCallback((text: string) => {
    adapterRef.current.sendMessage(text);
  }, []);

  const sendImage = useCallback(
    (dataUrl: string, options?: { triggerResponse?: boolean }) => {
      adapterRef.current.sendImage(dataUrl, options);
    },
    [],
  );

  const mute = useCallback((muted: boolean, options?: { source?: 'user' | 'system' }) => {
    adapterRef.current.mute(muted, options);
  }, []);

  const interrupt = useCallback(() => {
    adapterRef.current.interrupt();
  }, []);

  const pushToTalkStart = useCallback(() => {
    adapterRef.current.pushToTalkStart();
  }, []);

  const pushToTalkStop = useCallback(() => {
    adapterRef.current.pushToTalkStop();
  }, []);

  const sendEvent = useCallback((event: unknown) => {
    adapterRef.current.sendRawEvent(event);
  }, []);

  const sendSimulatedUserMessage = useCallback(
    (text: string, options?: { triggerResponse?: boolean }) => {
      adapterRef.current.sendSimulatedUserMessage(text, options);
    },
    [],
  );

  const getUsage = useCallback((): UsageInfo | null => {
    return adapterRef.current.getUsage();
  }, []);

  const updateSessionConfig = useCallback((config: Record<string, unknown>) => {
    adapterRef.current.updateSessionConfig?.(config);
  }, []);

  const replaceAudioTrack = useCallback(async (newStream: MediaStream) => {
    await adapterRef.current.replaceAudioTrack?.(newStream);
  }, []);

  return {
    status,
    agentStatus,
    connect,
    disconnect,
    sendMessage,
    sendImage,
    mute,
    interrupt,
    pushToTalkStart,
    pushToTalkStop,
    sendEvent,
    sendSimulatedUserMessage,
    getUsage,
    updateSessionConfig,
    replaceAudioTrack,
    usage,
  };
}
