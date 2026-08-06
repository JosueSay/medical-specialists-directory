import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      // Artefacto de despliegue generado por el empaquetado de la funcion
      '**/.deploy/**',
      '**/node_modules/**',
      '**/coverage/**',
      '**/*.d.ts',
      '.claude/**',
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  // Reglas transversales a todo el monorepo
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      'no-console': 'off',
      eqeqeq: ['error', 'always'],
      'prefer-const': 'error',
    },
  },

  // Backend: Node, sin acceso a APIs de navegador
  {
    files: ['apps/backend/**/*.ts'],
    languageOptions: {
      globals: globals.node,
    },
    rules: {
      // El unico punto donde se escribe a stdout es el logger
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['firebase-admin', 'firebase-admin/*'],
              message:
                'El SDK de Firestore solo puede importarse dentro de src/infrastructure (arquitectura limpia).',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['apps/backend/src/infrastructure/**/*.ts', 'apps/backend/src/functions.ts'],
    rules: {
      'no-restricted-imports': 'off',
    },
  },

  // Frontend: navegador + React
  {
    files: ['apps/frontend/**/*.{ts,tsx}'],
    languageOptions: {
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    },
  },

  // Tests: permitir helpers menos estrictos
  {
    files: ['**/tests/**/*.{ts,tsx}', '**/*.test.{ts,tsx}'],
    languageOptions: {
      globals: { ...globals.node, ...globals.browser },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },

  // Archivos de configuracion y scripts en JS que corren en Node
  {
    files: ['**/*.config.{js,ts}', 'eslint.config.js', '**/scripts/**/*.mjs'],
    languageOptions: {
      globals: globals.node,
    },
  },

  prettier,
);
