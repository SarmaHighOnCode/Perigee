import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Only the pure modules. PerigeeCamera.tsx needs a device and is verified
    // by running the app, not by a renderer stub that would prove nothing.
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
