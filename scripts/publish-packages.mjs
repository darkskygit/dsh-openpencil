/**
 * Publish the packed tarballs to GitHub Packages.
 *
 * Input is the `artifacts/` tree produced by `pack-package.mjs`: one `.tgz` per
 * package plus a sidecar `.tgz.json` holding `npm pack`'s name, version and
 * integrity. Native platform packages publish before the root plugin package so
 * a partially published release never leaves the root pointing at missing
 * optional dependencies.
 *
 * Authentication comes from the workflow's `GITHUB_TOKEN` through
 * `NODE_AUTH_TOKEN`, paired with the `.npmrc` entry that `actions/setup-node`
 * writes from `registry-url`. A version that already exists is skipped instead
 * of failing, because GitHub Packages refuses republishing and a rerun of the
 * same release must stay idempotent.
 */
import { spawnSync } from 'node:child_process'
import { readFile, readdir } from 'node:fs/promises'
import { join, resolve } from 'node:path'

const argumentRoot = resolve(process.argv[2] ?? 'artifacts')
const registry = process.env.NPM_REGISTRY ?? 'https://npm.pkg.github.com'
const rootPackageName = '@darkskygit/dsh-openpencil'

function run(command, args) {
  return spawnSync(command, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
}

async function collectTarballs(directory) {
  const found = []
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) {
      found.push(...(await collectTarballs(path)))
    } else if (entry.name.endsWith('.tgz')) {
      found.push(path)
    }
  }
  return found
}

async function readReport(tarball) {
  const sidecar = `${tarball}.json`
  const report = JSON.parse(await readFile(sidecar, 'utf8'))
  if (typeof report.name !== 'string' || typeof report.version !== 'string') {
    throw new Error(`${sidecar}: npm pack report has no name/version`)
  }
  return report
}

function isPublished(name, version) {
  const result = run('npm', ['view', `${name}@${version}`, 'version', '--registry', registry])
  if (result.status !== 0) {
    // E404 is the expected answer for an unpublished version; anything else is
    // a real registry or auth failure and must not be read as "not published".
    if (/\bE404\b|not found/i.test(result.stderr)) return false
    throw new Error(`npm view ${name}@${version} failed: ${result.stderr.trim()}`)
  }
  return result.stdout.trim() === version
}

function publish(tarball) {
  const result = run('npm', ['publish', tarball, '--registry', registry, '--access', 'public'])
  if (result.status !== 0) {
    throw new Error(`npm publish ${tarball} failed: ${result.stderr.trim() || result.stdout.trim()}`)
  }
}

const tarballs = await collectTarballs(argumentRoot)
if (tarballs.length === 0) throw new Error(`no .tgz files under ${argumentRoot}`)

const reports = await Promise.all(tarballs.map(async tarball => ({ tarball, report: await readReport(tarball) })))
const natives = reports.filter(entry => entry.report.name !== rootPackageName)
const roots = reports.filter(entry => entry.report.name === rootPackageName)
if (roots.length !== 1) throw new Error(`expected exactly one ${rootPackageName} tarball, found ${roots.length}`)

let published = 0
let skipped = 0
for (const { tarball, report } of [...natives, ...roots]) {
  const label = `${report.name}@${report.version}`
  if (isPublished(report.name, report.version)) {
    process.stdout.write(`skip   ${label} (already published)\n`)
    skipped += 1
    continue
  }
  publish(tarball)
  process.stdout.write(`publish ${label}\n`)
  published += 1
}

process.stdout.write(`\n${published} published, ${skipped} already present on ${registry}\n`)
