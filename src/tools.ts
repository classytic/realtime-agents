/**
 * @classytic/realtime-agents - Tool System
 *
 * Provider-agnostic tool factory. Same signature as OpenAI's tool()
 * for zero migration cost.
 */

import type { z } from 'zod';
import type { AgentTool } from './types.js';

/**
 * Create a provider-agnostic tool definition.
 *
 * The signature matches OpenAI's `tool()` exactly, so migrating existing
 * tools requires only changing the import path.
 *
 * @example
 * ```typescript
 * import { tool } from '@classytic/realtime-agents';
 * import { z } from 'zod';
 *
 * const weatherTool = tool({
 *   name: 'get_weather',
 *   description: 'Get weather for a city',
 *   parameters: z.object({ city: z.string() }),
 *   execute: async ({ city }) => `Weather in ${city}: Sunny`,
 * });
 * ```
 */
export function tool<T extends z.ZodType>(config: {
  readonly name: string;
  readonly description: string;
  readonly parameters: T;
  readonly execute: (args: z.infer<T>) => Promise<unknown>;
}): AgentTool<z.infer<T>> {
  return config as unknown as AgentTool<z.infer<T>>;
}
