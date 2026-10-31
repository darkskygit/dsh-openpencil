import { spawnSync } from 'node:child_process'

import { withoutCollabBootstrapBuildEnv } from './collab-bootstrap-config.mjs'
import { argumentValue, projectRoot } from './platforms.mjs'

// This fork builds the runtime without the proprietary op-auth library, so it
// has no collaboration endpoint to inject. Strip any inherited bootstrap
// variables: OpenPencil fails closed on a partial pair, and a stale value must
// never leak into a locally built binary.
const target = argumentValue('--target')
const args = [
  'build',
  '--manifest-path',
  'vendor/openpencil/Cargo.toml',
  '--locked',
  '--release',
  '-p',
  'op-host-web-server',
]
if (target !== undefined) args.push('--target', target)

const result = spawnSync(process.platform === 'win32' ? 'cargo.exe' : 'cargo', args, {
  cwd: projectRoot,
  env: withoutCollabBootstrapBuildEnv(process.env),
  stdio: 'inherit',
})
if (result.error !== undefined) throw result.error
if (result.status !== 0) {
  throw new Error(`op-host-web-server release build exited with status ${result.status ?? 'unknown'}`)
}

process.stdout.write(
  `built op-host-web-server${target === undefined ? '' : ` for ${target}`}\n`,
)
