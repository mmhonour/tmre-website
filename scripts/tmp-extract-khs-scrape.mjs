import { readFileSync, writeFileSync } from 'node:fs'

const path =
  'C:/Users/tmark/.cursor/projects/c-Users-tmark-tmre-website/agent-transcripts/1669d863-2b73-4677-9cc4-51403c808385/1669d863-2b73-4677-9cc4-51403c808385.jsonl'
const lines = readFileSync(path, 'utf8').split('\n')
const hits = lines.filter((l) =>
  l.includes('querySelector(\'h3\')') || l.includes('querySelector("h3")') ||
  l.includes('kingshighwaypta') && l.includes('extractRaw'),
)
console.log('hits', hits.length)
let n = 0
for (const line of lines) {
  if (!line.includes('Scrape') && !line.includes('directory pages')) continue
  if (!line.includes('Runtime.evaluate')) continue
  try {
    const j = JSON.parse(line)
    for (const c of j.message?.content ?? []) {
      const expr = c.input?.arguments?.params?.expression
      if (typeof expr === 'string' && expr.includes('querySelector') && expr.includes('h3')) {
        n++
        writeFileSync(`tmp-scrape-expr-${n}.js`, expr)
        console.log(`wrote tmp-scrape-expr-${n}.js len=${expr.length} desc=${c.mcpDetails?.description || c.input?.mcpDetails?.description || ''}`)
        console.log('school hint', /KHS|CMS|SCHOOL/.exec(expr)?.[0], 'multi?', expr.includes('querySelectorAll'))
      }
    }
  } catch {}
}
