import js from '@eslint/js';
import tseslint from 'typescript-eslint';

const angularImport = ['error', { patterns: ['@angular/*'] }];

export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**', 'coverage/**'] },
  {
    files: ['public/**/*.js'],
    languageOptions: {
      globals: {
        cancelAnimationFrame: 'readonly',
        document: 'readonly',
        fetch: 'readonly',
        performance: 'readonly',
        requestAnimationFrame: 'readonly',
        window: 'readonly',
      },
    },
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['projects/domain/**/*.ts'],
    rules: { 'no-restricted-imports': angularImport },
  },
  {
    files: ['projects/engines/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', { patterns: ['@angular/*', '@chippy/files'] }],
    },
  },
  {
    files: ['projects/files/**/*.ts'],
    rules: { 'no-restricted-imports': angularImport },
  },
  {
    files: ['src/app/tracker/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', { patterns: ['**/listen/**'] }],
    },
  },
  {
    files: ['src/app/listen/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', { patterns: ['**/tracker/**'] }],
    },
  },
);
