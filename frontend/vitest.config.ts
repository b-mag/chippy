import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['projects/**/*.spec.ts', 'src/**/*.spec.ts'],
    environment: 'node',
    setupFiles: ['./vitest.setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: [
        'projects/domain/src/lib/**/*.ts',
        'projects/engines/src/lib/**/*.ts',
        'projects/files/src/lib/**/*.ts',
        'projects/files/src/public-api.ts',
        'src/app/app-config.ts',
        'src/app/app-config.service.ts',
        'src/app/support-entitlement.service.ts',
        'src/app/aesthetic.service.ts',
        'src/app/auth.ts',
      ],
      exclude: ['**/*.spec.ts', '**/types.ts'],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 80,
        statements: 80,
      },
    },
  },
  resolve: {
    alias: {
      '@chippy/domain': path.resolve('projects/domain/src/public-api.ts'),
      '@chippy/engines': path.resolve('projects/engines/src/public-api.ts'),
      '@chippy/files': path.resolve('projects/files/src/public-api.ts'),
    },
  },
});
