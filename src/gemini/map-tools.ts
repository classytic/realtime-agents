/**
 * @classytic/realtime-agents/gemini - Tool Mapping
 *
 * Converts AgentTool[] (zod schemas) to Gemini FunctionDeclaration[].
 * Uses zodToJsonSchema for schema conversion.
 */

import type { FunctionDeclaration } from '@google/genai';
import { zodToJsonSchema } from 'zod-to-json-schema';
import type { AgentTool } from '../types.js';

/**
 * Convert a provider-agnostic AgentTool to a Gemini FunctionDeclaration.
 */
function toolToFunctionDeclaration(tool: AgentTool): FunctionDeclaration {
  const jsonSchema = zodToJsonSchema(tool.parameters as any, { target: 'openApi3' });

  return {
    name: tool.name,
    description: tool.description,
    parameters: jsonSchema as FunctionDeclaration['parameters'],
  };
}

/**
 * Convert an array of AgentTools to Gemini FunctionDeclarations.
 */
export function mapToolsToFunctionDeclarations(
  tools: readonly AgentTool[],
): FunctionDeclaration[] {
  return tools.map(toolToFunctionDeclaration);
}
