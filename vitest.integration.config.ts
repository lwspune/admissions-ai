import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'
import { readFileSync } from 'node:fs'

// Integration tests talk to the real database, so .env.local is loaded here
// rather than depending on the shell. They are kept out of `npm test` because
// they need credentials and a reachable project.
for (const line of readFileSync(new URL('./.env.local', import.meta.url), 'utf8').split('\n')) {
  if (!line.trim() || line.startsWith('#') || !line.includes('=')) continue
  const i = line.indexOf('=')
  process.env[line.slice(0, i).trim()] ??= line.slice(i + 1).trim()
}

export default defineConfig({
  test: { environment: 'node', include: ['src/**/*.itest.ts'], testTimeout: 30_000, fileParallelism: false },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      'server-only': fileURLToPath(new URL('./src/server/server-only-shim.ts', import.meta.url)),
    },
  },
})
