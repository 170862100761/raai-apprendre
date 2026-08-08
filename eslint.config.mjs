import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { FlatCompat } from '@eslint/eslintrc'

/**
 * Configuration ESLint.
 *
 * Elle manquait au dépôt : le script `lint` existait, sa configuration non, si
 * bien que `npm run verifier` s'arrêtait avant d'atteindre l'architecture et
 * les tests. Le garde-fou annoncé dans CLAUDE.md n'avait donc jamais tourné en
 * entier.
 *
 * Parti pris : peu de règles, mais bloquantes. Une configuration bavarde finit
 * désactivée fichier par fichier, et ne protège plus rien.
 */
const compat = new FlatCompat({ baseDirectory: dirname(fileURLToPath(import.meta.url)) })

const configuration = [
  {
    ignores: ['.next/**', 'node_modules/**', 'next-env.d.ts', 'prisma/migrations/**'],
  },

  ...compat.extends('next/core-web-vitals', 'next/typescript'),

  {
    rules: {
      // ------------------------------------------------------------------
      // Accessibilité — bloquante, pas indicative.
      //
      // La plateforme vise des établissements publics : le RGAA n'est pas une
      // option, et une régression d'accessibilité repérée à la relecture
      // humaine est repérée trop tard.
      // ------------------------------------------------------------------
      'jsx-a11y/alt-text': 'error',
      'jsx-a11y/anchor-has-content': 'error',
      'jsx-a11y/aria-props': 'error',
      'jsx-a11y/label-has-associated-control': 'error',
      'jsx-a11y/no-autofocus': 'error',

      // ------------------------------------------------------------------
      // TypeScript
      // ------------------------------------------------------------------
      // `any` annule le typage strict sur lequel repose tout le reste.
      '@typescript-eslint/no-explicit-any': 'error',

      // Un paramètre inutilisé est souvent un oubli de branchement. Le préfixe
      // `_` reste la façon explicite de dire « je sais, et c'est voulu ».
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],

      // ------------------------------------------------------------------
      // Ce qui n'a rien à faire dans du code livré
      // ------------------------------------------------------------------
      // `console.error` et `console.warn` restent permis : ils servent à
      // signaler qu'un journal d'audit n'a pas pu être écrit, par exemple.
      'no-console': ['error', { allow: ['error', 'warn'] }],
      'no-debugger': 'error',
    },
  },

  {
    // Les outils en ligne de commande PARLENT : c'est leur seule sortie.
    files: ['outils/**/*.mjs', 'outils/**/*.ts', '*.config.mjs', '.dependency-cruiser.cjs'],
    rules: { 'no-console': 'off' },
  },
]

export default configuration
