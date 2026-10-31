import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'

import {
  collabBootstrapEnvNames,
  validatedCollabBootstrapUrls,
  withoutCollabBootstrapBuildEnv,
} from '../scripts/collab-bootstrap-config.mjs'
import { parseManagedHandshake } from '../scripts/managed-handshake.mjs'
import { projectRoot } from '../scripts/platforms.mjs'

const VALID = Object.freeze({
  [collabBootstrapEnvNames[0]]: 'https://cn.openpencil.dev/api/v1/collaboration/bootstrap',
  [collabBootstrapEnvNames[1]]: 'https://global.openpencil.dev/api/v1/collaboration/bootstrap',
})

test('production editor builds require two distinct canonical relay bootstrap URLs', () => {
  assert.throws(
    () => validatedCollabBootstrapUrls({}),
    new RegExp(`${collabBootstrapEnvNames[0]} is required`),
  )
  assert.throws(
    () => validatedCollabBootstrapUrls({ [collabBootstrapEnvNames[0]]: VALID[collabBootstrapEnvNames[0]] }),
    new RegExp(`${collabBootstrapEnvNames[1]} is required`),
  )
  assert.deepEqual(validatedCollabBootstrapUrls(VALID), {
    cn: VALID[collabBootstrapEnvNames[0]],
    global: VALID[collabBootstrapEnvNames[1]],
  })
  assert.throws(
    () => validatedCollabBootstrapUrls({
      ...VALID,
      [collabBootstrapEnvNames[1]]: VALID[collabBootstrapEnvNames[0]],
    }),
    /must be distinct/,
  )
  assert.throws(
    () => validatedCollabBootstrapUrls({
      ...VALID,
      [collabBootstrapEnvNames[0]]: 'http://127.0.0.1/api/v1/collaboration/bootstrap',
    }),
    /must use https/,
  )
})

test('build-only collaboration URLs are removed from non-Cargo child environments', () => {
  const sanitized = withoutCollabBootstrapBuildEnv({
    PATH: '/test/bin',
    ...VALID,
  })
  assert.deepEqual(sanitized, { PATH: '/test/bin' })
})

test('managed handshake parse failures never disclose the temporary token', () => {
  const marker = 'temporary-token-must-not-appear'
  for (const line of [
    `{\"ok\":true,\"token\":\"${marker}\"`,
    JSON.stringify({ ok: true, token: marker }),
  ]) {
    assert.throws(
      () => parseManagedHandshake(line, 'darwin-arm64'),
      error => {
        const diagnostics = [error.message, error.stack, error.cause]
          .filter(value => value !== undefined)
          .join('\n')
        assert.doesNotMatch(diagnostics, new RegExp(marker))
        return true
      },
    )
  }
})

test('every non-Cargo release child scrubs build-only URLs and handshake parsing stays opaque', async () => {
  const bootstrapConfig = await readFile(`${projectRoot}/scripts/collab-bootstrap-config.mjs`, 'utf8')
  const packageVerifier = await readFile(`${projectRoot}/scripts/verify-platform-packages.mjs`, 'utf8')

  for (const [label, source, expectedChildren] of [
    ['bootstrap validator', bootstrapConfig, 1],
    ['package verifier', packageVerifier, 2],
  ]) {
    const childCount = [...source.matchAll(/\bspawn(?:Sync)?\(/gu)].length
    const scrubbedEnvCount = [...source.matchAll(
      /env:\s*(?:\{\s*\.\.\.)?(?:withoutEditorDiscoveryEnv\()?withoutCollabBootstrapBuildEnv\(process\.env\)/gu,
    )].length
    assert.equal(childCount, expectedChildren, `${label}: unexpected child-process surface`)
    assert.equal(scrubbedEnvCount, childCount, `${label}: every child must receive a scrubbed environment`)
  }

  assert.match(packageVerifier, /parseManagedHandshake\(line, platform\.id\)/u)
  assert.doesNotMatch(packageVerifier, /JSON\.parse\(line\)|JSON\.stringify\(line\)|\$\{line\}/u)
})

test('the six-platform release builds stub-daemons and publishes to GitHub Packages', async () => {
  const workflow = await readFile(`${projectRoot}/.github/workflows/release.yml`, 'utf8')
  const runtimeBuild = await readFile(`${projectRoot}/scripts/build-editor-runtime.mjs`, 'utf8')

  assert.match(workflow, /node scripts\/build-editor-runtime\.mjs --target \$\{\{ matrix\.rustTarget \}\}/)
  assert.match(workflow, /--require-runtime/)
  assert.match(workflow, /registry-url: \$\{\{ env\.NPM_REGISTRY \}\}/)
  assert.match(workflow, /NODE_AUTH_TOKEN: \$\{\{ secrets\.GITHUB_TOKEN \}\}/)
  assert.match(workflow, /packages: write/)
  assert.match(workflow, /node scripts\/publish-packages\.mjs artifacts/)

  // This fork links the inert auth stub: no collaboration endpoint is injected,
  // no proprietary ABI gate runs, and no npm environment holds a secret.
  for (const name of collabBootstrapEnvNames) {
    assert.doesNotMatch(workflow, new RegExp(name), `${name} must not reach the release workflow`)
  }
  assert.doesNotMatch(workflow, /check-op-auth-cargo-build/u)
  assert.doesNotMatch(workflow, /environment: (?:release-production|npm)/u)
  assert.doesNotMatch(workflow, /--require-collab-bootstrap/u)
  assert.match(runtimeBuild, /withoutCollabBootstrapBuildEnv\(process\.env\)/u)
})
