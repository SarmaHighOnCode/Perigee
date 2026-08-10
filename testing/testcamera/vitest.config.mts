import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'plugins/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary'],
      include: ['src/camera/**/*.ts', 'src/diagnostics/**/*.ts', 'src/media/**/*.ts'],
    },
  },
});
