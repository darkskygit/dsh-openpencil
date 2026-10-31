/** Import a Pencil `.pen` document as a current-schema `.op` file. */

import { isAbsolute, resolve } from 'node:path'
import { realpath, stat } from 'node:fs/promises'
import { defineTool, type ToolRunContext } from '@deepseek-ai/dsh-tools'
import type { EditorHostController, ImportPenResult } from './editor-host.js'
import { expandUserHome } from './renderer.js'
import { OPENPENCIL_IMPORT_TOOL_NAME } from './tool-names.js'

/** Source extensions this tool accepts. The converter also repairs legacy `.op`. */
const SOURCE_EXTENSIONS: readonly string[] = ['.pen', '.op']

export interface DesignImportArgs {
  path: string
  target?: string
  overwrite?: boolean
}

export interface DesignImportResult extends ImportPenResult {
  sourceTool: typeof OPENPENCIL_IMPORT_TOOL_NAME
  note: string
}

function renderJson(_args: unknown, value: unknown): [{ type: 'text'; text: string }] {
  return [{ type: 'text', text: JSON.stringify(value, null, 2) }]
}

/** Session workspace the caller resolves paths against (mirrors first-party tools). */
function sessionWorkspace(exec: ToolRunContext): string {
  return exec.agent?.session.header.cwd ?? process.cwd()
}

function extensionOf(path: string): string {
  const dot = path.lastIndexOf('.')
  return dot <= 0 ? '' : path.slice(dot).toLowerCase()
}

/**
 * Resolve the source document. The file must already exist: import reads it and
 * never creates it, so a typo stays an error instead of an empty document.
 */
async function resolveSource(raw: string, workspace: string): Promise<string> {
  const expanded = expandUserHome(raw.trim())
  if (expanded === '') throw new Error(`${OPENPENCIL_IMPORT_TOOL_NAME}: path is required`)
  const target = isAbsolute(expanded) ? expanded : resolve(workspace, expanded)
  let real: string
  try {
    real = await realpath(target)
  } catch {
    throw new Error(`${OPENPENCIL_IMPORT_TOOL_NAME}: source document not found: ${raw}`)
  }
  const info = await stat(real)
  if (!info.isFile()) throw new Error(`${OPENPENCIL_IMPORT_TOOL_NAME}: not a regular file: ${raw}`)
  const extension = extensionOf(real)
  if (!SOURCE_EXTENSIONS.includes(extension)) {
    throw new Error(
      `${OPENPENCIL_IMPORT_TOOL_NAME}: expected a ${SOURCE_EXTENSIONS.join(' or ')} source (got "${extension || '(none)'}")`,
    )
  }
  return real
}

/** Resolve an explicit target. The file may be absent; import writes it. */
function resolveTarget(raw: string, workspace: string): string {
  const expanded = expandUserHome(raw.trim())
  if (expanded === '') throw new Error(`${OPENPENCIL_IMPORT_TOOL_NAME}: target must not be empty`)
  const target = isAbsolute(expanded) ? expanded : resolve(workspace, expanded)
  if (extensionOf(target) !== '.op') {
    throw new Error(`${OPENPENCIL_IMPORT_TOOL_NAME}: target must end in .op (got "${extensionOf(target) || '(none)'}")`)
  }
  return target
}

export function createDesignImportTool(editorHost: EditorHostController) {
  return defineTool({
    name: OPENPENCIL_IMPORT_TOOL_NAME,
    description: 'Import a Pencil-style `.pen` document — or a legacy `.op` file — by converting it into a current-schema `.op` file OpenPencil can open. '
      + 'The converter reads the source, runs the canonical load (version gate, legacy field repair, unknown-field warnings), and writes a separate `.op` target. '
      + 'The source file is only read: it is never renamed, never rewritten, and a target equal to the source is refused. '
      + 'Pass `target` to choose the output path; otherwise the source path with a `.op` extension is used. An existing target is kept unless `overwrite` is true. '
      + 'A source with a format version this build rejects fails with the schema reason, and partial output is never written. '
      + 'After success, call openpencil_render on the returned target to preview or edit it.',
    parameters: {
      path: {
        type: 'string', required: true,
        description: 'Path to the `.pen` (or legacy `.op`) source document, absolute or relative to the session workspace.',
      },
      target: {
        type: 'string',
        description: 'Optional `.op` output path. Defaults to the source path with a `.op` extension.',
      },
      overwrite: {
        type: 'boolean',
        description: 'Replace an existing target file. Defaults to false, which refuses to overwrite.',
      },
    },
    output: {
      schema: {
        type: 'object', additionalProperties: false,
        properties: {
          source: { type: 'string', required: true },
          target: { type: 'string', required: true },
          version: { type: 'string', required: true },
          warnings: {
            type: 'array', required: true,
            items: { type: 'string' },
          },
          sourceTool: { type: 'string', const: OPENPENCIL_IMPORT_TOOL_NAME, required: true },
          note: { type: 'string', required: true },
        },
      },
      render: renderJson,
    },
    async execute(args: DesignImportArgs, exec): Promise<DesignImportResult> {
      const workspace = sessionWorkspace(exec)
      const source = await resolveSource(args.path, workspace)
      const target = args.target === undefined ? undefined : resolveTarget(args.target, workspace)
      const result = await editorHost.importPen({
        path: source,
        ...(target === undefined ? {} : { target }),
        ...(args.overwrite === true ? { overwrite: true } : {}),
        signal: exec.signal,
      })
      const repaired = result.warnings.length
      return {
        ...result,
        sourceTool: OPENPENCIL_IMPORT_TOOL_NAME,
        note: `Imported ${source} as ${result.target} (schema version ${result.version}). `
          + (repaired === 0
            ? 'The loader reported no compatibility repairs. '
            : `The loader reported ${repaired} compatibility warning(s); the target is still canonical. `)
          + 'Call openpencil_render on the target to open or preview it.',
      }
    },
  })
}
