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

  const [status, setStatus] = useState<SessionStatus>('disconnected');
  const [agentStatus, setAgentStatus] = useState<AgentStatus>('idle');
  const [usage, setUsage] = useState<UsageInfo | null>(null);
  const { logClientEvent, logServerEvent } = useEvent();

  const historyHandlers = useSessionHistory().current;

  // Track saved transcripts to prevent duplicates
  const savedTranscriptIds = useRef<Set<string>>(new Set());

  const updateStatus = useCallback(
    (newStatus: SessionStatus) => {
      setStatus(newStatus);
      callbacks.onStatusChange?.(newStatus);
      logClientEvent({}, newStatus.toUpperCase());
    },
    [callbacks, logClientEvent],
  );

  const updateAgentStatus = useCallback(
    (newStatus: AgentStatus) => {
      setAgentStatus(newStatus);
      callbacks.onAgentStatusChange?.(newStatus);
    },
    [callbacks],
  );

  const connect = useCallback(
    async (options: ConnectOptions) => {
      updateStatus('connecting');

      try {
        const handlers: TransportEventHandlers = {
          onStatusChange: updateStatus,
          onAgentStatusChange: updateAgentStatus,
          onError: (e) => {
            logServerEvent({ type: 'error', message: e.message });
            callbacks.onError?.(e);
          },
          onTranscriptDelta: (itemId, delta) => {
            historyHandlers.handleTranscriptionDelta({ item_id: itemId, delta });
          },
          onTranscriptComplete: (entry) => {
            callbacks.onTranscriptComplete?.(entry);
          },
          onAgentHandoff: callbacks.onAgentHandoff,
          onToolStart: (toolName, args) => {
            historyHandlers.handleAgentToolStart(
              {},
              null,
              { name: toolName, arguments: args },
            );
          },
          onToolEnd: (toolName, result) => {
            historyHandlers.handleAgentToolEnd(
              {},
              null,
              { name: toolName },
              result,
            );
          },
          onUserSpeechStart: callbacks.onUserSpeechStart,
          onUserSpeechStop: callbacks.onUserSpeechStop,
          onTransportEvent: (event) => {
            // Handle transcript events from transport
            if (event.type === 'conversation.item.input_audio_transcription.completed') {
              historyHandlers.handleTranscriptionCompleted(event);
              if (callbacks.onTranscriptComplete && event.transcript) {
                callbacks.onTranscriptComplete({
                  role: 'user',
                  text: String(event.transcript),
                  itemId: String(event.item_id || ''),
                });
              }
            } else if (event.type === 'response.audio_transcript.done') {
              historyHandlers.handleTranscriptionCompleted(event);
              if (callbacks.onTranscriptComplete && event.transcript) {
                callbacks.onTranscriptComplete({
                  role: 'assistant',
                  text: String(event.transcript),
                  itemId: String(event.item_id || ''),
                });
              }
            } else if (event.type === 'response.audio_transcript.delta') {
              historyHandlers.handleTranscriptionDelta(event);
            } else if (event.type === 'history_added') {
              const item = event.item as Record<string, unknown>;
              if (item) {
                historyHandlers.handleHistoryAdded(item);
                // Also fire onTranscriptComplete for assistant messages
                if (item.type === 'message' && item.role === 'assistant' && item.itemId) {
                  const text = extractMessageText(item.content as unknown[]);
                  if (text && !savedTranscriptIds.current.has(item.itemId as string)) {
                    savedTranscriptIds.current.add(item.itemId as string);
                    callbacks.onTranscriptComplete?.({
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
                historyHandlers.handleHistoryUpdated(items);
                items.forEach((item) => {
                  if (item.type === 'message' && item.role === 'assistant' && item.itemId) {
                    const text = extractMessageText(item.content as unknown[]);
                    if (text && !savedTranscriptIds.current.has(item.itemId as string)) {
                      savedTranscriptIds.current.add(item.itemId as string);
                      callbacks.onTranscriptComplete?.({
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
            historyHandlers.handleGuardrailTripped(
              {},
              null,
              { result },
            );
          },
          onToolApprovalRequest: callbacks.onToolApprovalRequest,
          onUsageUpdate: (u) => {
            setUsage(u);
            callbacks.onUsageUpdate?.(u);
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
        callbacks.onError?.(err);
        throw error;
      }
    },
    [callbacks, updateStatus, updateAgentStatus, historyHandlers, logServerEvent],
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

  const mute = useCallback((muted: boolean) => {
    adapterRef.current.mute(muted);
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

  const sendSimulatedUserMessage = useCallback((text: string) => {
    adapterRef.current.sendSimulatedUserMessage(text);
  }, []);

  const getUsage = useCallback((): Record<string, unknown> | null => {
    return adapterRef.current.getUsage();
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
    usage,
  };
}
