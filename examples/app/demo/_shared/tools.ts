import { z } from 'zod';
import { tool } from '@classytic/realtime-agents';

// =============================================================================
// Shared demo tools — identical across OpenAI and Gemini demos to showcase
// the unified DX of @classytic/realtime-agents.
// =============================================================================

export const weatherTool = tool({
  name: 'getWeather',
  description: 'Get the current weather for a given location',
  parameters: z.object({
    location: z.string().describe('City name, e.g. "Tokyo"'),
  }),
  execute: async ({ location }) => {
    const conditions = ['Sunny', 'Cloudy', 'Rainy', 'Windy', 'Snowy'];
    const temp = Math.floor(Math.random() * 35) + 5;
    const condition = conditions[Math.floor(Math.random() * conditions.length)];
    return {
      location,
      temperature: `${temp}°C`,
      condition,
      humidity: `${Math.floor(Math.random() * 60) + 30}%`,
    };
  },
});

export const calculatorTool = tool({
  name: 'calculate',
  description: 'Perform a math calculation (add, subtract, multiply, divide)',
  parameters: z.object({
    operation: z.enum(['add', 'subtract', 'multiply', 'divide']),
    a: z.number(),
    b: z.number(),
  }),
  execute: async ({ operation, a, b }) => {
    const ops = {
      add: a + b,
      subtract: a - b,
      multiply: a * b,
      divide: b !== 0 ? a / b : 'Cannot divide by zero',
    };
    return { operation, a, b, result: ops[operation] };
  },
});

export const jokeTool = tool({
  name: 'tellJoke',
  description: 'Tell a random programming joke',
  parameters: z.object({}),
  execute: async () => {
    const jokes = [
      'Why do programmers prefer dark mode? Because light attracts bugs.',
      'A SQL query walks into a bar, walks up to two tables and asks: "Can I join you?"',
      "Why was the JavaScript developer sad? Because he didn't Node how to Express himself.",
      "There are only 10 types of people: those who understand binary and those who don't.",
    ];
    return { joke: jokes[Math.floor(Math.random() * jokes.length)] };
  },
});

export const timeTool = tool({
  name: 'getCurrentTime',
  description: 'Get the current date and time',
  parameters: z.object({}),
  execute: async () => `The current date and time is: ${new Date().toLocaleString()}`,
});

/** All demo tools — pass this to AgentConfig.tools */
export const demoTools = [weatherTool, calculatorTool, jokeTool, timeTool] as const;

/** Agent instructions shared across providers */
export const demoInstructions = `You are a friendly demo assistant.

You have access to tools:
- **getWeather**: Get weather for any location
- **calculate**: Do math (add, subtract, multiply, divide)
- **tellJoke**: Tell programming jokes
- **getCurrentTime**: Get the current time

Keep responses concise and friendly. This is a demo of the @classytic/realtime-agents package.`;
