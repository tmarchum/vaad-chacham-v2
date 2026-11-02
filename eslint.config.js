import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  // dist + the Capacitor copy of it + generated/CLI code — never lint build output.
  globalIgnores(['dist', 'android/**', 'scripts/**', 'supabase/**']),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
      parserOptions: {
        ecmaVersion: 'latest',
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    rules: {
      // Capitalized = component/context identifiers (used via JSX, which core
      // no-unused-vars can't see without eslint-plugin-react); same for
      // destructured component params like ({ icon: Icon }). Catch bindings
      // are allowed to go unused (log-less fallbacks).
      'no-unused-vars': ['error', {
        varsIgnorePattern: '^[A-Z_]',
        argsIgnorePattern: '^[A-Z_]|^_',
        caughtErrors: 'none',
      }],
      // react-hooks v7 "compiler" rules: keep them visible as warnings — most
      // remaining hits are long-standing patterns (state synced in effects)
      // that work; genuinely bug-shaped ones (components defined inside a
      // component) were fixed at the source.
      'react-hooks/static-components': 'warn',
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/purity': 'warn',
      'react-hooks/immutability': 'warn',
      'react-hooks/preserve-manual-memoization': 'warn',
    },
  },
  {
    // Entry point + context/hook modules legitimately export non-components.
    files: ['src/main.jsx', 'src/hooks/**'],
    rules: { 'react-refresh/only-export-components': 'off' },
  },
  {
    files: ['vite.config.js'],
    languageOptions: { globals: globals.node },
  },
])
