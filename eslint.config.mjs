import js from '@eslint/js'
import prettier from 'eslint-config-prettier'
import reactHooks from 'eslint-plugin-react-hooks'
import tseslint from 'typescript-eslint'

/*
 * Flat config is last-match-wins, so the order below matters: the blocks that
 * switch rules off for a file subset have to come after the blocks that switch
 * them on for everything.
 */
export default tseslint.config(
  {
    // `.claude/` holds vendored agent tooling installed by npx, not project
    // source: linting it reports on someone else's code style.
    ignores: ['node_modules/**', 'out/**', 'release/**', 'build/**', 'dist/**', 'DATA EXPORT/**', '.claude/**']
  },

  js.configs.recommended,

  // Type-aware linting: the rules that actually matter here (a forgotten await
  // on a store write, an unhandled rejection) need type information to be seen.
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname
      }
    }
  },

  {
    files: ['src/renderer/**/*.{ts,tsx}'],
    // `configs['recommended-latest']` is still the eslintrc shape (plugins as an
    // array of names); the flat namespace is the one ESLint 10 accepts.
    ...reactHooks.configs.flat['recommended-latest'],
    rules: {
      ...reactHooks.configs.flat['recommended-latest'].rules,
      /*
       * Every hit is a manual data loader flipping `loading` before awaiting a
       * fetch. Satisfying the rule would mean Suspense or an external store for
       * all of them; kept as a warning so new occurrences stay visible without
       * blocking the build.
       */
      'react-hooks/set-state-in-effect': 'warn'
    }
  },

  {
    rules: {
      // An underscore prefix is the documented way to say "deliberately unused".
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' }
      ],
      // Fire-and-forget is sometimes right, but it has to be spelled out with
      // `void` rather than left ambiguous.
      '@typescript-eslint/no-floating-promises': ['error', { ignoreVoid: true }],
      '@typescript-eslint/no-misused-promises': ['error', { checksVoidReturn: false }],
      // Non-null assertions are used deliberately on narrowed AniList fields.
      '@typescript-eslint/no-non-null-assertion': 'off',
      eqeqeq: ['error', 'smart'],
      'no-console': ['warn', { allow: ['warn', 'error'] }]
    }
  },

  // Tests and Node-side tooling: console output is the point, and the fixtures
  // deliberately poke at loosely typed shapes.
  {
    files: ['test/**/*.ts', 'src/**/*.test.ts'],
    rules: {
      'no-console': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off'
    }
  },

  /*
   * Plain JS tooling (this file, the Electron install shim) lives outside the
   * TypeScript projects. It must come after the blocks above so that turning the
   * type-aware rules off actually sticks — otherwise they get re-enabled and then
   * fail for lack of type information.
   */
  {
    files: ['**/*.{js,mjs,cjs}'],
    ...tseslint.configs.disableTypeChecked,
    languageOptions: {
      parserOptions: { projectService: false, project: false, program: null },
      // Without the TS parser these files lose their ambient Node globals.
      // `fetch` is one of them since Node 18, and the screenshot script uses it.
      globals: { console: 'readonly', process: 'readonly', fetch: 'readonly' }
    },
    rules: {
      ...tseslint.configs.disableTypeChecked.rules,
      'no-console': 'off'
    }
  },

  // Must stay last: switches off every rule Prettier already governs.
  prettier
)
