import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: { alias: { '@': root } },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.js'],
    // Suites share process.env.DATA_DIR and the store cache, so run files one at a time.
    fileParallelism: false,
    testTimeout: 20000,
  },
});
