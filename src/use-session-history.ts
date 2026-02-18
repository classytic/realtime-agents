'use client';

/**
 * @classytic/realtime-agents - Session History Hook
 *
 * Bridges transport events to TranscriptContext and EventContext.
 * Provider-agnostic — works with normalized events from any adapter.
 */

import { useRef } from 'react';
import { useTranscript } from './transcript-context.js';
import { useEvent } from './event-context.js';
import { extractMessageText } from './utils.js';

export function useSessionHistory() {
  const {
    transcriptItems,
    addTranscriptBreadcrumb,
    addTranscriptMessage,
    updateTranscriptMessage,
    updateTranscriptItem,
  } = useTranscript();

  const { logServerEvent } = useEvent();

  // ── Helpers ──

  const extractFunctionCallByName = (
    name: string,
    content: unknown[] = [],
  ): Record<string, unknown> | undefined => {
    if (!Array.isArray(content)) return undefined;
    return content.find(
      (c) =>
        c &&
        typeof c === 'object' &&
        (c as Record<string, unknown>).type === 'function_call' &&
        (c as Record<string, unknown>).name === name,
    ) as Record<string, unknown> | undefined;
  };

  const maybeParseJson = (val: unknown): unknown => {
    if (typeof val === 'string') {
      try {
        return JSON.parse(val);
      } catch {
        return val;
      }
    }
    return val;
  };

  const extractLastAssistantMessage = (
    history: unknown[] = [],
  ): Record<string, unknown> | undefined => {
    if (!Array.isArray(history)) return undefined;
    return [...history].reverse().find(
      (c) =>
        c &&
        typeof c === 'object' &&
        (c as Record<string, unknown>).type === 'message' &&
        (c as Record<string, unknown>).role === 'assistant',
    ) as Record<string, unknown> | undefined;
  };

  const extractModeration = (obj: unknown): Record<string, unknown> | undefined => {
    if (!obj || typeof obj !== 'object') return undefined;
    const o = obj as Record<string, unknown>;
    if ('moderationCategory' in o) return o;
    if ('outputInfo' in o) return extractModeration(o.outputInfo);
    if ('output' in o) return extractModeration(o.output);
    if ('result' in o) return extractModeration(o.result);
    return undefined;
  };

  const sketchilyDetectGuardrailMessage = (text: string) => {
    return text.match(/Failure Details: (\{.*?\})/)?.[1];
  };

  // ── Event Handlers ──

  function handleAgentToolStart(
    details: Record<string, unknown>,
    _agent: unknown,
    functionCall: Record<string, unknown>,
  ) {
    const context = details?.context as Record<string, unknown> | undefined;
    const history = context?.history as unknown[] | undefined;
    const lastFunctionCall = extractFunctionCallByName(functionCall.name as string, history);
    const function_name = lastFunctionCall?.name as string | undefined;
    const function_args = lastFunctionCall?.arguments;

    addTranscriptBreadcrumb(`function call: ${function_name}`, function_args as Record<string, unknown>);
  }

  function handleAgentToolEnd(
    details: Record<string, unknown>,
    _agent: unknown,
    _functionCall: Record<string, unknown>,
    result: unknown,
  ) {
    const context = details?.context as Record<string, unknown> | undefined;
    const history = context?.history as unknown[] | undefined;
    const lastFunctionCall = extractFunctionCallByName(_functionCall.name as string, history);
    addTranscriptBreadcrumb(
      `function call result: ${lastFunctionCall?.name}`,
      maybeParseJson(result) as Record<string, unknown>,
    );
  }

  function handleHistoryAdded(item: Record<string, unknown>) {
    if (!item || item.type !== 'message') return;

    const { itemId, role, content = [] } = item;
    if (itemId && role) {
      const isUser = role === 'user';
      let text = extractMessageText(content as unknown[]);

      const guardrailMessage = sketchilyDetectGuardrailMessage(text);
      if (guardrailMessage) {
        try {
          const failureDetails = JSON.parse(guardrailMessage);
          addTranscriptBreadcrumb('Output Guardrail Active', { details: failureDetails });
        } catch {
          addTranscriptBreadcrumb('Output Guardrail Active', { raw: guardrailMessage });
        }
      } else {
        addTranscriptMessage(itemId as string, role as 'user' | 'assistant', text);
      }
    }
  }

  function handleHistoryUpdated(items: Record<string, unknown>[]) {
    items.forEach((item) => {
      if (!item || item.type !== 'message') return;

      const { itemId, content = [] } = item;
      const text = extractMessageText(content as unknown[]);

      if (text) {
        updateTranscriptMessage(itemId as string, text, false);
      }
    });
  }

  function handleTranscriptionDelta(item: Record<string, unknown>) {
    const itemId = item.item_id as string;
    const deltaText = (item.delta as string) || '';
    if (itemId) {
      updateTranscriptMessage(itemId, deltaText, true);
    }
  }

  function handleTranscriptionCompleted(item: Record<string, unknown>) {
    const itemId = item.item_id as string;
    const transcript = item.transcript as string | undefined;
    const finalTranscript = !transcript || transcript === '\n' ? '[inaudible]' : transcript;

    if (itemId) {
      updateTranscriptMessage(itemId, finalTranscript, false);
      const transcriptItem = transcriptItems.find((i) => i.itemId === itemId);
      updateTranscriptItem(itemId, { status: 'DONE' });

      if (transcriptItem?.guardrailResult?.status === 'IN_PROGRESS') {
        updateTranscriptItem(itemId, {
          guardrailResult: { status: 'DONE', category: 'NONE', rationale: '' },
        });
      }
    }
  }

  function handleGuardrailTripped(
    details: Record<string, unknown>,
    _agent: unknown,
    guardrail: Record<string, unknown>,
  ) {
    const result = guardrail.result as Record<string, unknown>;
    const output = result?.output as Record<string, unknown>;
    const outputInfo = output?.outputInfo;
    const moderation = extractModeration(outputInfo);
    logServerEvent({ type: 'guardrail_tripped', payload: moderation });

    const context = details?.context as Record<string, unknown> | undefined;
    const history = context?.history as unknown[] | undefined;
    const lastAssistant = extractLastAssistantMessage(history);

    if (lastAssistant && moderation) {
      const category = (moderation.moderationCategory as string) ?? 'NONE';
      const rationale = (moderation.moderationRationale as string) ?? '';
      const offendingText = moderation?.testText as string | undefined;

      updateTranscriptItem(lastAssistant.itemId as string, {
        guardrailResult: {
          status: 'DONE',
          category: category as 'NONE',
          rationale,
          testText: offendingText,
        },
      });
    }
  }

  const handlersRef = useRef({
    handleAgentToolStart,
    handleAgentToolEnd,
    handleHistoryUpdated,
    handleHistoryAdded,
    handleTranscriptionDelta,
    handleTranscriptionCompleted,
    handleGuardrailTripped,
  });

  // Update on every render so handlers capture the latest closure state
  handlersRef.current = {
    handleAgentToolStart,
    handleAgentToolEnd,
    handleHistoryUpdated,
    handleHistoryAdded,
    handleTranscriptionDelta,
    handleTranscriptionCompleted,
    handleGuardrailTripped,
  };

  return handlersRef;
}
