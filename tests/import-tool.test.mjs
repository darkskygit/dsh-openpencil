import assert from 'node:assert/strict'
import { mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, test } from 'node:test'

const { createDesignImportTool } = await import('../lib/import-tool.js')

const root = await mkdtemp(join(tmpdir(), 'dsh-openpencil-import-tool-'))
// macOS resolves /var to /private/var, and the tool realpaths its source.
const resolvedRoot = await realpath(root)
after(async () => {
  await rm(root, { recursive: true, force: true })
})

function execution(cwd) {
  return {
    signal: new AbortController().signal,
    agent: { session: { header: { cwd } } },
  }
}

function stubHost(result, calls = []) {
  return {
    async importPen(options) {
      calls.push(options)
      return result ?? {
        source: options.path,
        target: options.target ?? options.path.replace(/\.pen$/i, '.op'),
        version: '1.0',
        warnings: [],
      }
    },
  }
}

test('imports a .pen source and reports the converter result', async () => {
  await writeFile(join(root, 'design.pen'), '{"version":"2.10","children":[]}\n')
  const calls = []
  const tool = createDesignImportTool(stubHost(undefined, calls))

  const result = await tool.execute({ path: 'design.pen' }, execution(root))

  assert.equal(result.sourceTool, 'openpencil_import')
  assert.equal(result.source, join(resolvedRoot, 'design.pen'))
  assert.equal(result.target, join(resolvedRoot, 'design.op'))
  assert.equal(result.version, '1.0')
  assert.match(result.note, /no compatibility repairs/)
  assert.equal(calls.length, 1, 'the converter must run exactly once')
  assert.equal(calls[0].path, join(resolvedRoot, 'design.pen'))
  assert.equal(calls[0].target, undefined, 'an omitted target stays the converter default')
})

test('reports compatibility warnings and forwards the explicit target', async () => {
  await writeFile(join(root, 'legacy.pen'), '{"version":"2.11","children":[]}\n')
  const calls = []
  const tool = createDesignImportTool(stubHost({
    source: join(resolvedRoot, 'legacy.pen'),
    target: join(root, 'out', 'legacy.op'),
    version: '1.0',
    warnings: ['LegacyRolePromoted', 'FillStringRepaired'],
  }, calls))

  const result = await tool.execute(
    { path: 'legacy.pen', target: 'out/legacy.op', overwrite: true },
    execution(root),
  )

  assert.deepEqual(result.warnings, ['LegacyRolePromoted', 'FillStringRepaired'])
  assert.match(result.note, /2 compatibility warning\(s\)/)
  assert.equal(calls[0].target, join(root, 'out', 'legacy.op'))
  assert.equal(calls[0].overwrite, true)
})

test('refuses a missing source instead of creating an empty document', async () => {
  const tool = createDesignImportTool(stubHost())
  await assert.rejects(
    tool.execute({ path: 'absent.pen' }, execution(root)),
    /source document not found/,
  )
})

test('refuses a source that is not a .pen or .op document', async () => {
  await writeFile(join(root, 'notes.txt'), 'plain text\n')
  const tool = createDesignImportTool(stubHost())
  await assert.rejects(
    tool.execute({ path: 'notes.txt' }, execution(root)),
    /expected a \.pen or \.op source/,
  )
})

test('refuses a target that is not a .op path', async () => {
  await writeFile(join(root, 'target-check.pen'), '{"version":"2.10","children":[]}\n')
  const tool = createDesignImportTool(stubHost())
  await assert.rejects(
    tool.execute({ path: 'target-check.pen', target: 'out.json' }, execution(root)),
    /target must end in \.op/,
  )
})
