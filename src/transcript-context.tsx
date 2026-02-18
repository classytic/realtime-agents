'use client';

/**
 * @classytic/realtime-agents - Transcript Context
 *
 * Conversation UI state provider for managing transcript items.
 */

import { createContext, useContext, useState } from 'react';
import type { PropsWithChildren } from 'react';
import type { TranscriptItem } from './context-types.js';

interface TranscriptContextValue {
  readonly transcriptItems: readonly TranscriptItem[];
  readonly addTranscriptMessage: (
    itemId: string,
    role: 'user' | 'assistant',
    text?: string,
    isHidden?: boolean,
  ) => void;
  readonly updateTranscriptMessage: (itemId: string, text: string, isDelta: boolean) => void;
  readonly addTranscriptBreadcrumb: (title: string, data?: Record<string, unknown>) => void;
  readonly toggleTranscriptItemExpand: (itemId: string) => void;
  readonly updateTranscriptItem: (itemId: string, updatedProperties: Partial<TranscriptItem>) => void;
}

const TranscriptContext = createContext<TranscriptContextValue | undefined>(undefined);

function newTimestampPretty(): string {
  const now = new Date();
  const time = now.toLocaleTimeString([], {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const ms = now.getMilliseconds().toString().padStart(3, '0');
  return `${time}.${ms}`;
}

export function TranscriptProvider({ children }: PropsWithChildren) {
  const [transcriptItems, setTranscriptItems] = useState<TranscriptItem[]>([]);

  const addTranscriptMessage = (
    itemId: string,
    role: 'user' | 'assistant',
    text = '',
    isHidden = false,
  ) => {
    setTranscriptItems((prev) => {
      if (prev.some((log) => log.itemId === itemId && log.type === 'MESSAGE')) {
        return prev;
      }

      const newItem: TranscriptItem = {
        itemId,
        type: 'MESSAGE',
        role,
        title: text,
        expanded: false,
        timestamp: newTimestampPretty(),
        createdAtMs: Date.now(),
        status: 'IN_PROGRESS',
        isHidden,
      };

      return [...prev, newItem];
    });
  };

  const updateTranscriptMessage = (itemId: string, newText: string, append = false) => {
    setTranscriptItems((prev) =>
      prev.map((item) => {
        if (item.itemId === itemId && item.type === 'MESSAGE') {
          return {
            ...item,
            title: append ? (item.title ?? '') + newText : newText,
          };
        }
        return item;
      }),
    );
  };

  const addTranscriptBreadcrumb = (title: string, data?: Record<string, unknown>) => {
    setTranscriptItems((prev) => [
      ...prev,
      {
        itemId: `breadcrumb-${crypto.randomUUID()}`,
        type: 'BREADCRUMB' as const,
        title,
        data,
        expanded: false,
        timestamp: newTimestampPretty(),
        createdAtMs: Date.now(),
        status: 'DONE' as const,
        isHidden: false,
      },
    ]);
  };

  const toggleTranscriptItemExpand = (itemId: string) => {
    setTranscriptItems((prev) =>
      prev.map((log) => (log.itemId === itemId ? { ...log, expanded: !log.expanded } : log)),
    );
  };

  const updateTranscriptItem = (itemId: string, updatedProperties: Partial<TranscriptItem>) => {
    setTranscriptItems((prev) =>
      prev.map((item) => (item.itemId === itemId ? { ...item, ...updatedProperties } : item)),
    );
  };

  return (
    <TranscriptContext
      value={{
        transcriptItems,
        addTranscriptMessage,
        updateTranscriptMessage,
        addTranscriptBreadcrumb,
        toggleTranscriptItemExpand,
        updateTranscriptItem,
      }}
    >
      {children}
    </TranscriptContext>
  );
}

export function useTranscript(): TranscriptContextValue {
  const context = useContext(TranscriptContext);
  if (!context) {
    throw new Error('useTranscript must be used within a TranscriptProvider');
  }
  return context;
}
