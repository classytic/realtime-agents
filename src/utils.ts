/**
 * @classytic/realtime-agents - Shared Utilities
 */

/**
 * Extract text content from an OpenAI-style content array.
 * Handles input_text, input_audio, output_text, output_audio, text, and audio types.
 */
export function extractMessageText(content: unknown[] = []): string {
  if (!Array.isArray(content)) return '';

  return content
    .map((c) => {
      if (!c || typeof c !== 'object') return '';
      const item = c as Record<string, unknown>;
      if (item.type === 'input_text') return (item.text as string) ?? '';
      if (item.type === 'input_audio') return (item.transcript as string) ?? '';
      if (item.type === 'output_text') return (item.text as string) ?? '';
      if (item.type === 'output_audio') return (item.transcript as string) ?? '';
      if (item.type === 'text') return (item.text as string) ?? '';
      if (item.type === 'audio') return (item.transcript as string) ?? '';
      return '';
    })
    .filter(Boolean)
    .join('\n');
}
