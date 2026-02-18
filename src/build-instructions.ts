/**
 * @classytic/realtime-agents - Build Instructions
 *
 * Template variable replacement utility for dynamic agent instructions.
 */

/**
 * Replace `{{variable}}` placeholders in a template string with values.
 *
 * @example
 * ```typescript
 * const instructions = buildInstructions(
 *   'You are interviewing for {{jobTitle}}. Duration: {{duration}} min.',
 *   { jobTitle: 'Software Engineer', duration: 15 }
 * );
 * ```
 */
export function buildInstructions(
  template: string,
  variables: Readonly<Record<string, string | number | boolean | undefined>>,
): string {
  let result = template;

  for (const [key, value] of Object.entries(variables)) {
    const placeholder = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
    result = result.replace(placeholder, String(value ?? ''));
  }

  return result;
}
