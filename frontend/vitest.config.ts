import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['projects/**/*.spec.ts', 'src/**/*.spec.ts'],
    environment: 'node',
  },
  resolve: {
    alias: {
      '@chippy/domain': path.resolve('projects/domain/src/public-api.ts'),
      '@chippy/engines': path.resolve('projects/engines/src/public-api.ts'),
      '@chippy/files': path.resolve('projects/files/src/public-api.ts'),
    },
  },
});
