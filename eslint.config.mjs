import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import next from '@next/eslint-plugin-next'
import reactHooks from 'eslint-plugin-react-hooks'

export default tseslint.config(
  { ignores: ['.next/**', 'node_modules/**', 'next-env.d.ts', 'dist/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  next.flatConfig.coreWebVitals,
  {
    // Build config files run in Node, not the browser.
    files: ['*.config.{mjs,ts}', 'scripts/**/*.{ts,mjs}'],
    languageOptions: {
      globals: {
        process: 'readonly', console: 'readonly',
        fetch: 'readonly', URL: 'readonly',
      },
    },
  },
  {
    files: ['**/*.tsx'],
    plugins: { 'react-hooks': reactHooks },
    rules: reactHooks.configs.recommended.rules,
  },
  {
    files: ['**/*.{ts,tsx}'],
    rules: {
      // No debug logging in committed code; warn/error at boundaries is fine.
      'no-console': ['error', { allow: ['warn', 'error'] }],
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
)
