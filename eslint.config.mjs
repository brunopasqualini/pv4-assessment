// @ts-check
import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import tseslint from 'typescript-eslint';

export default defineConfig({
  files: ['**/*.{js,ts}'],
  extends: [js.configs.recommended, tseslint.configs.strict, tseslint.configs.stylistic],
  rules: {
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    'no-console': ['warn', { allow: ['warn', 'error'] }],
    'object-curly-newline': ['error', { multiline: false, consistent: true }],
  },
  ignores: ['cdk.out/**', 'dist/**', 'node_modules/**', 'static/**', '*.js', '*.mjs'],
});
