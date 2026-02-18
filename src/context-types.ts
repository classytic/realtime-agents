/**
 * @classytic/realtime-agents - Context Types
 *
 * Shared types for EventContext and TranscriptContext.
 */

export type ModerationCategory =
  | 'sexual'
  | 'hate'
  | 'harassment'
  | 'self-harm'
  | 'sexual/minors'
  | 'hate/threatening'
  | 'violence/graphic'
  | 'violence'
  | 'NONE';

export interface GuardrailResultType {
  readonly status: 'IN_PROGRESS' | 'DONE';
  readonly category?: ModerationCategory;
  readonly rationale?: string;
  readonly testText?: string;
}

export interface TranscriptItem {
  readonly itemId: string;
  readonly type: 'MESSAGE' | 'BREADCRUMB';
  readonly role?: 'user' | 'assistant';
  readonly title?: string;
  readonly data?: Record<string, unknown>;
  readonly expanded: boolean;
  readonly timestamp: string;
  readonly createdAtMs: number;
  readonly status: 'IN_PROGRESS' | 'DONE';
  readonly isHidden: boolean;
  readonly guardrailResult?: GuardrailResultType;
}

export interface LoggedEvent {
  readonly id: string;
  readonly direction: 'client' | 'server';
  readonly expanded: boolean;
  readonly timestamp: string;
  readonly eventName: string;
  readonly eventData: Record<string, unknown>;
}
