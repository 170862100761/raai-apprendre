import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // Les tests de permissions partagent une base : les faire tourner en
    // parallèle produirait des faux négatifs impossibles à reproduire.
    fileParallelism: false,
    testTimeout: 30_000,
  },
})
