/**
 * @classytic/realtime-agents/openai - Tool Mapping
 *
 * Converts AgentTool[] to an OpenAI RealtimeAgent with native tools.
 */

import { RealtimeAgent, tool as openaiTool } from '@openai/agents/realtime';
import type { AgentConfig } from '../types.js';
import { OPENAI_DEFAULT_VOICE } from './voices.js';
import type { OpenAIAgentProviderOptions } from './types.js';

/**
 * Build an OpenAI `RealtimeAgent` from a provider-agnostic `AgentConfig`.
 *
 * This maps our `AgentTool[]` (with zod schemas) to OpenAI's native tool()
 * format and wraps them in a `RealtimeAgent` instance.
 */
export function buildRealtimeAgent(config: AgentConfig): RealtimeAgent {
  const nativeTools = config.tools.map((t) =>
    openaiTool({
      name: t.name,
      description: t.description,
      parameters: t.parameters as any,
      execute: t.execute,
    }),
  );

  const openaiOptions = config.providerOptions?.openai as
    | OpenAIAgentProviderOptions
    | undefined;

  return new RealtimeAgent({
    name: config.name,
    instructions: config.instructions,
    tools: nativeTools,
    voice: config.voice ?? OPENAI_DEFAULT_VOICE,
    prompt: openaiOptions?.prompt,
    handoffDescription: openaiOptions?.handoffDescription,
  });
}
