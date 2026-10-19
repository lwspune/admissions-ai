import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  // UTC, as Vercel's servers run: a date formatted without a named zone then
  // fails here instead of passing on an India-time laptop (2026-10-19).
  test: { environment: 'node', include: ['src/**/*.test.ts'], env: { TZ: 'UTC' } },
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
})
