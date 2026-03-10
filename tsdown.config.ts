import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'openai/index': 'src/openai/index.ts',
    'gemini/index': 'src/gemini/index.ts',
  },
  format: ['esm'],
  platform: 'neutral',
  sourcemap: false,
  dts: false,
  clean: true,
  exports: false,
  publint: false,
  external: [
    'react',
    'react-dom',
    /^react\/.*/,
    'zod',
    'zod-to-json-schema',
    '@openai/agents',
    '@openai/agents/realtime',
    /^@openai\/.*/,
    '@google/genai',
    /^@google\/.*/,
  ],
});
