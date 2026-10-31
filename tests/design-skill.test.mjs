import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

import {
  DEFAULT_BUNDLE_PATH,
  DEFAULT_OUTPUT_PATH,
  buildDesignSkill,
  createDshDesignSkill,
} from '../scripts/build-design-skill.mjs'
import {
  OPENPENCIL_DESIGN_GUIDANCE_SECTION,
  OPENPENCIL_DESIGN_SKILL_CONTENT,
  OPENPENCIL_DESIGN_SKILL_NAME,
  registerOpenPencilDesignGuidance,
  registerOpenPencilDesignSkill,
} from '../lib/design-skill.js'

test('generated skill is a thin, direct adapter over the authoritative native draft context', async () => {
  const onDisk = await readFile(DEFAULT_OUTPUT_PATH, 'utf8')
  assert.equal(OPENPENCIL_DESIGN_SKILL_CONTENT, onDisk)
  assert.equal(OPENPENCIL_DESIGN_SKILL_NAME, 'openpencil-design')

  for (const section of [
    '## Strict Default Transaction',
    '## Begin Contract Is Authoritative',
    '## Publication Gate',
  ]) assert.match(onDisk, new RegExp(section.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))

  assert.match(onDisk, /openpencil_pipeline_begin.*first `openpencil_pipeline_batch`.*second `openpencil_pipeline_batch`.*openpencil_pipeline_finish/is)
  assert.match(onDisk, /Call `openpencil_pipeline_begin\(\{brief\}\)` exactly once and immediately.*opens the private live canvas/is)
  assert.match(onDisk, /Omit `path` unless.*explicitly named.*plugin chooses a concrete collision-resistant `.op` filename.*preserve an explicitly named path exactly/is)
  assert.match(onDisk, /path.*rootNodeId.*platform.*canvas.*buildContract.*locked.*Never reinterpret.*switch paths.*rebuild/is)
  assert.match(onDisk, /Advance without narration.*do not put reasoning.*inspection.*another tool call between successful pipeline calls/is)
  assert.match(onDisk, /thrown error.*canContinue:false.*ends the transaction.*Do not retry.*inspect.*context-read.*abort.*replacement draft/is)
  assert.match(onDisk, /```js\nconst draftId = "<exact begin\.draftId>";\nconst script = String\.raw`\.\.\.`;\nconst r = await tools\.openpencil_pipeline_batch\(\{ draftId, script \}\);\nreturn r;\n```/is)
  assert.match(onDisk, /fresh scope.*batch 2.*do not recreate Page, App Content, Header, or Hero.*exact nodeId returned by batch 1/is)
  assert.match(onDisk, /I.*K.*return opaque node-id strings.*not nodes.*bindings only as.*parents.*never assign.*binding\.x\/y.*any member/is)
  assert.match(onDisk, /Finish each product card.*media.*omit.*name.*price.*before the next card/is)
  assert.match(onDisk, /bundled ecommerce-modern-light direction.*white base.*warm-tinted sections.*1120px centered content.*56px Hero display.*orange limited to CTA\/active\/price/is)
  assert.match(onDisk, /Visible copy follows the user's language.*Chinese request means Chinese copy/is)
  assert.match(onDisk, /literal hex colors in nodes.*no aliases.*Desktop commerce Header.*role navbar.*Nav role nav-links.*44px role nav-link.*frame containing text.*never a text node.*Header actions role toolbar.*44x44 role icon-button frames.*Button\/CTA.*role button.*at least 44px.*CTA is role button 160x48.*#C2410C\/#FFF.*exactly three equal-width product cards from one coherent collection.*gap 24.*no unused tail.*gray armchair.*Artemide Tolomeo lamp.*potted plant.*within four words/is)
  assert.match(onDisk, /Desktop Hero.*optional warm wrapper.*full-width Hero.*copy 512.*gap 64.*image 448.*horizontal padding 160.*headline\/subtitle.*width:"fill_container"/is)
  assert.match(onDisk, /Generic commerce uses the direct leaf `I\(hero,\{type:"image".*imageSearchQuery:"gray loveseat isolated photo"\}\)`.*never wrap it.*image:\{\.\.\.\}.*mix shapes.*reuse that query in a product card/is)
  assert.match(onDisk, /4–6 layer `layout:"none"` ellipse\/path composition only when the user explicitly requests illustration\/no photos/is)
  assert.match(onDisk, /plain stacked rounded rectangles.*lone small icon/is)
  assert.match(onDisk, /Each Hero\/Product\/Art\/Media frame.*one primary visual.*imageSearchQuery.*substantial composed shapes.*never both.*host enriches committed commerce images before each live preview.*canonical post-final fallback/is)
  assert.doesNotMatch(onDisk, /two or three distinct product images|copy <=60%|right visual 30–45%|2–4 layers/i)
  assert.match(onDisk, /Desktop commerce Header.*role navbar.*Nav role nav-links.*44px role nav-link.*frame containing text.*Header actions role toolbar.*44x44 role icon-button frames/is)
  assert.match(onDisk, /ordinary generation never calls context, inspect, render, read-image, or abort tools/is)
  assert.match(onDisk, /Every generated text node explicitly uses `fontFamily: "Inter, system-ui, sans-serif"`/i)
  assert.doesNotMatch(onDisk, /fontFamily:\s*["'](?:Inter|system-ui)["']/i)
  assert.match(onDisk, /stage:"needs_correction".*canContinue:true.*complete, non-empty `repairTargets`.*omitted === 0/is)
  assert.match(onDisk, /every target has `operation:"U"`.*exact non-empty `nodeId`.*non-empty `patch`/is)
  assert.match(onDisk, /exactly one additional bounded script using only `U\(target\.nodeId, target\.patch\)`.*finish exactly once more/is)
  assert.match(onDisk, /Never guess a patch or node id.*never retry.*inspect.*context-read.*abort.*rebuild/is)
  assert.match(onDisk, /successful finish already owns deterministic finalization.*exact PNG generation.*atomic `createIfAbsent` publication.*live-editor presentation/is)
  assert.match(onDisk, /Do not add a visual self-review loop/i)
  assert.doesNotMatch(onDisk, /get_design_agent_prompt|firstBurst|completionBurst|\bDSL\b|\boperations\b/i)
  assert.doesNotMatch(onDisk, /task list|task shell|eight-item|designAgentPrompt/i)

  const bytes = Buffer.byteLength(onDisk, 'utf8')
  const estimatedTokens = Math.ceil([...onDisk].length / 4)
  assert.deepEqual(onDisk.match(/^\d+\./gm), ['1.', '2.', '3.'])
  assert.ok(bytes <= 9_200, `thin adapter grew to ${bytes} bytes`)
  assert.ok(estimatedTokens <= 2_300, `thin adapter grew to about ${estimatedTokens} tokens`)
})

test('build is deterministic and fails closed when the upstream contract drifts', async () => {
  const bundle = JSON.parse(await readFile(DEFAULT_BUNDLE_PATH, 'utf8'))
  const upstream = bundle.files['skills/openpencil-design/SKILL.md']
  const first = createDshDesignSkill(upstream)
  const second = createDshDesignSkill(upstream)
  assert.equal(first, second)
  assert.equal(first, await readFile(DEFAULT_OUTPUT_PATH, 'utf8'))

  const root = await mkdtemp(join(tmpdir(), 'dsh-openpencil-design-skill-'))
  try {
    const rebuiltPath = join(root, 'rebuilt', 'SKILL.md')
    const rebuilt = await buildDesignSkill({ outputPath: rebuiltPath })
    assert.equal(rebuilt.outputPath, rebuiltPath)
    assert.equal(await readFile(rebuiltPath, 'utf8'), first)

    const brokenPath = join(root, 'skill-bundle.json')
    const broken = structuredClone(bundle)
    broken.files['skills/openpencil-design/SKILL.md'] = upstream.replace('## Layout Rules', '## Layout Contract')
    await writeFile(brokenPath, JSON.stringify(broken), 'utf8')
    await assert.rejects(
      buildDesignSkill({ bundlePath: brokenPath, outputPath: join(root, 'SKILL.md') }),
      /Layout Rules count is 0|missing sentinel.*layout containers/i,
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

function serviceHarness() {
  const injections = []
  const registeredSkills = []
  const promptSections = []
  let skillRemovalCount = 0
  let promptRemovalCount = 0
  let fiberDisposeCount = 0
  const ctx = {
    inject(names, install) {
      injections.push([...names])
      const effectDisposers = []
      const child = {
        ...(names.includes('skills') ? {
          skills: {
            register(skill) {
              registeredSkills.push(skill)
              return () => { skillRemovalCount += 1 }
            },
          },
        } : {}),
        ...(names.includes('systemPrompt') ? {
          systemPrompt: {
            section(section) {
              promptSections.push(section)
              return () => { promptRemovalCount += 1 }
            },
          },
        } : {}),
        effect(mount) {
          const dispose = mount()
          if (typeof dispose === 'function') effectDisposers.push(dispose)
          return dispose
        },
      }
      install(child)
      return {
        dispose() {
          fiberDisposeCount += 1
          for (const dispose of effectDisposers.reverse()) dispose()
        },
      }
    },
  }
  return {
    ctx,
    injections,
    registeredSkills,
    promptSections,
    counts: () => ({ skillRemovalCount, promptRemovalCount, fiberDisposeCount }),
  }
}

test('optional skill and system-prompt services register and tear down with their fibers', () => {
  const harness = serviceHarness()
  const disposeSkill = registerOpenPencilDesignSkill(harness.ctx)
  const disposeGuidance = registerOpenPencilDesignGuidance(harness.ctx)

  assert.deepEqual(harness.injections, [['skills'], ['systemPrompt']])
  assert.equal(harness.registeredSkills.length, 1)
  assert.deepEqual(
    {
      name: harness.registeredSkills[0].name,
      source: harness.registeredSkills[0].source,
      content: harness.registeredSkills[0].content,
    },
    {
      name: 'openpencil-design',
      source: 'bundled',
      content: OPENPENCIL_DESIGN_SKILL_CONTENT,
    },
  )
  assert.match(harness.registeredSkills[0].description, /Optional troubleshooting\/reference.*Ordinary creation.*pipeline_begin.*must not load/is)
  assert.match(harness.registeredSkills[0].whenToUse, /Only when.*explicitly asks.*openpencil-design.*troubleshooting.*never.*ordinary design request/is)

  assert.equal(harness.promptSections.length, 1)
  assert.equal(harness.promptSections[0], OPENPENCIL_DESIGN_GUIDANCE_SECTION)
  assert.equal(harness.promptSections[0].name, 'openpencil:design-skill-guidance')
  assert.equal(harness.promptSections[0].order, 130)
  const guidance = harness.promptSections[0].text()
  assert.match(guidance, /one strict transaction.*openpencil_pipeline_begin.*batch 1.*batch 2.*openpencil_pipeline_finish/is)
  assert.match(guidance, /Call begin exactly once and immediately.*never load `openpencil-design` first/is)
  assert.match(guidance, /Omit begin\.path unless.*explicitly named.*plugin chooses.*concrete collision-resistant `.op` filename.*Preserve an explicitly named path exactly/is)
  assert.match(guidance, /Pass the user's direct request as begin\.brief.*without adding a platform.*viewport.*device.*did not name/is)
  assert.match(guidance, /path.*root.*platform.*canvas.*never reinterpret.*switch.*rebuild/is)
  assert.match(guidance, /without narration.*planning.*comparison.*inspection.*unrelated tool call/is)
  assert.match(guidance, /thrown error.*canContinue:false.*terminal.*do not retry.*context-read.*abort.*replacement draft/is)
  assert.match(guidance, /run_code use exactly:\nconst draftId = "<exact begin\.draftId>";\nconst script = String\.raw`\.\.\.`;\nconst r = await tools\.openpencil_pipeline_batch\(\{ draftId, script \}\);\nreturn r;/is)
  assert.match(guidance, /Quote the exact begin\.draftId into the standalone `draftId` string first/is)
  assert.match(guidance, /fixed call object contains only `draftId` and `script`.*return only `r`/is)
  assert.match(guidance, /category rail.*distinct matching icon tile.*数码\/electronics.*smartphone.*camera.*食品\/food.*utensils.*sandwich.*croissant.*never use `lamp` or `coffee`/is)
  assert.match(guidance, /Default to one image outside commerce.*ecommerce-modern-light.*clean white base.*warm-tinted section rhythm.*1120px centered content.*56px Hero display.*horizontal two-column split row.*optional warm section wrapper.*Hero is full-width.*padding:\[64,160\].*copy width 512.*gap 64.*image width 448.*headline and subtitle.*width:"fill_container"/is)
  assert.match(guidance, /Visible copy follows the user request language consistently.*Chinese request means Chinese copy/is)
  assert.match(guidance, /literal hex colors.*not palette alias variables.*Header role navbar.*height 64.*padding:\[0,160\].*Nav role nav-links.*44px role nav-link frames.*text child.*never put nav-link on text.*Header actions role toolbar.*44x44 role icon-button frames.*CTA role button.*160x48.*#C2410C\/#FFFFFF.*label inside the CTA binding.*Generic commerce.*directly under Hero.*I\(hero,\{type:"image".*imageSearchQuery:"gray loveseat isolated photo"\}\).*`imageSearchQuery` is a direct field.*never `image:\{\.\.\.\}`.*never a wrapper.*never mixed with shapes.*never reused by a product card/is)
  assert.match(guidance, /4-6 layer layout:none ellipse\/path composition only when the user explicitly requests illustration\/no photos/is)
  assert.match(guidance, /Desktop commerce uses exactly three equal-width fill_container product cards from one coherent collection.*24px gaps.*no unused right tail.*mobile product rail.*at most 2 fill_container cards or equal numeric-width cards.*clipped scroller.*gray armchair isolated photo.*artemide tolomeo lamp photo.*potted plant isolated photo.*third card is a potted plant.*imageSearchQuery.*no more than four English words.*exactly one product.*never uses a broad lifestyle, collection, or category query.*lone small icon.*one primary visual.*never an image plus an icon placeholder/is)
  assert.match(guidance, /host enriches committed commerce images before each live preview.*finish retains one canonical post-final fallback/is)
  assert.match(guidance, /published:true.*terminal success/is)
  assert.match(guidance, /canContinue:true.*continues by doing exactly what its `next` says.*needs_preview.*needs_refinalization.*call finish exactly once more.*stage:"needs_correction".*complete non-empty `repairTargets`.*omitted.*`0`/is)
  assert.match(guidance, /every item contains `operation:"U"`.*nodeId.*patch.*exactly one U-only batch.*finish exactly once more/is)
  assert.match(guidance, /host bounds repair rounds at two.*another complete repairTargets array.*stop on anything except `published:true`.*never retry.*inspect.*read an image\/context.*abort.*rebuild/is)
  assert.doesNotMatch(guidance, /firstBurst|completionBurst|\bDSL\b/i)

  disposeGuidance()
  disposeSkill()
  assert.deepEqual(harness.counts(), {
    skillRemovalCount: 1,
    promptRemovalCount: 1,
    fiberDisposeCount: 2,
  })
})
