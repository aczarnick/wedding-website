import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'node:path';

const DB_TESTS = 'test/db/**/*.test.ts';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
    },
    // The database-integration tests reset the same tables, so they cannot run
    // concurrently with each other. Only that group is serialized; unit tests
    // keep running in parallel.
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          exclude: ['**/node_modules/**', DB_TESTS],
        },
      },
      {
        extends: true,
        test: {
          name: 'db',
          include: [DB_TESTS],
          fileParallelism: false,
        },
      },
    ],
  },
  resolve: {
    alias: [
      { find: '@', replacement: path.resolve(__dirname, './src') },
      { find: /^.+\.(jpg|jpeg|png)$/, replacement: path.resolve(__dirname, './test/mocks/imageMock.ts') },
    ],
  },
});
