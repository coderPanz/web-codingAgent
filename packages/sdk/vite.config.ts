import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      formats: ['es', 'iife'],
      name: 'CodingAgentSDK',
      fileName: (format) => {
        if (format === 'es') return 'coding-agent-sdk.es.js';
        return 'coding-agent-sdk.iife.js';
      },
    },
    rollupOptions: {
      external: [],
      output: {
        inlineDynamicImports: true,
      },
    },
    minify: 'esbuild',
    sourcemap: true,
    outDir: 'dist',
  },
});
