// Runs `next build` into a separate output directory.
//
//   npm run build:check
//
// A verification build must never write to the .next directory a running
// `next dev` is serving from. When it does, every JS chunk and stylesheet
// 404s and the dev server stays broken until someone restarts it — with no
// error to explain why.

import { spawnSync } from 'node:child_process'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const nextBin = join(root, 'node_modules', 'next', 'dist', 'bin', 'next')

const { status } = spawnSync(process.execPath, [nextBin, 'build'], {
  cwd: root,
  stdio: 'inherit',
  env: { ...process.env, NEXT_DIST_DIR: '.next-verify' },
})

process.exitCode = status ?? 1
