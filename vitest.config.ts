import { defineConfig } from 'vitest/config';

// Separate from vite.config.ts, whose root points at the web app.
export default defineConfig({
  test: { include: ['test/**/*.test.ts'] },
});
