/**
 * @classytic/realtime-agents - Tool Context
 *
 * Global tool context for tools that need session access during execution.
 * Set during connect, cleared during disconnect.
 */

export interface ToolContext {
  readonly sessionContext: Readonly<Record<string, unknown>>;
  /** Send image through the active session (replaces provider-specific methods) */
  readonly sendImage: (dataUrl: string, options?: { triggerResponse?: boolean }) => void;
  /** Provider-specific session reference (escape hatch, typed by consumers) */
  readonly providerSession: unknown;
}

let ref: ToolContext | null = null;

/** Set the tool context (called by useRealtimeSession during connect) */
export function setToolContext(context: ToolContext): void {
  ref = context;
}

/** Clear the tool context (called during disconnect) */
export function clearToolContext(): void {
  ref = null;
}

/** Get the current tool context (for tools that need session access) */
export function getToolContext(): ToolContext {
  if (!ref) {
    throw new Error('Tool context not initialized. Ensure session is connected.');
  }
  return ref;
}
