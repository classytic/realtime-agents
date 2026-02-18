'use client';

/**
 * @classytic/realtime-agents - Event Context
 *
 * Debug event logging provider for client/server transport events.
 */

import { createContext, useContext, useState } from 'react';
import type { PropsWithChildren } from 'react';
import type { LoggedEvent } from './context-types.js';

interface EventContextValue {
  readonly loggedEvents: readonly LoggedEvent[];
  readonly logClientEvent: (eventObj: Record<string, unknown>, eventNameSuffix?: string) => void;
  readonly logServerEvent: (eventObj: Record<string, unknown>, eventNameSuffix?: string) => void;
  readonly logHistoryItem: (item: Record<string, unknown>) => void;
  readonly toggleExpand: (id: string) => void;
}

const EventContext = createContext<EventContextValue | undefined>(undefined);

/** Maximum number of events to keep in memory (prevents unbounded growth) */
const MAX_EVENTS = 1000;

export function EventProvider({ children }: PropsWithChildren) {
  const [loggedEvents, setLoggedEvents] = useState<LoggedEvent[]>([]);

  function addLoggedEvent(
    direction: 'client' | 'server',
    eventName: string,
    eventData: Record<string, unknown>,
  ) {
    const id = (eventData.event_id as string) || crypto.randomUUID();
    setLoggedEvents((prev) => {
      const next = [
        ...prev,
        {
          id,
          direction,
          eventName,
          eventData,
          timestamp: new Date().toLocaleTimeString(),
          expanded: false,
        },
      ];
      // Ring buffer: trim oldest events when exceeding limit
      return next.length > MAX_EVENTS ? next.slice(-MAX_EVENTS) : next;
    });
  }

  const logClientEvent = (eventObj: Record<string, unknown>, eventNameSuffix = '') => {
    const name = `${eventObj.type || ''} ${eventNameSuffix || ''}`.trim();
    addLoggedEvent('client', name, eventObj);
  };

  const logServerEvent = (eventObj: Record<string, unknown>, eventNameSuffix = '') => {
    const name = `${eventObj.type || ''} ${eventNameSuffix || ''}`.trim();
    addLoggedEvent('server', name, eventObj);
  };

  const logHistoryItem = (item: Record<string, unknown>) => {
    let eventName = item.type as string;
    if (item.type === 'message') {
      eventName = `${item.role}.${item.status}`;
    }
    if (item.type === 'function_call') {
      eventName = `function.${item.name}.${item.status}`;
    }
    addLoggedEvent('server', eventName, item);
  };

  const toggleExpand = (id: string) => {
    setLoggedEvents((prev) =>
      prev.map((log) => (log.id === id ? { ...log, expanded: !log.expanded } : log)),
    );
  };

  return (
    <EventContext value={{ loggedEvents, logClientEvent, logServerEvent, logHistoryItem, toggleExpand }}>
      {children}
    </EventContext>
  );
}

export function useEvent(): EventContextValue {
  const context = useContext(EventContext);
  if (!context) {
    throw new Error('useEvent must be used within an EventProvider');
  }
  return context;
}
