import { readFileSync, writeFileSync } from 'node:fs'

const path =
  'C:/Users/tmark/.cursor/projects/c-Users-tmark-tmre-website/agent-transcripts/1669d863-2b73-4677-9cc4-51403c808385/1669d863-2b73-4677-9cc4-51403c808385.jsonl'
const lines = readFileSync(path, 'utf8').split('\n')
const line = lines.find((l) => l.includes('Scrape all CMS directory pages'))
if (!line) throw new Error('not found')
const j = JSON.parse(line)
const expr = j.message.content[0].input.arguments.params.expression
writeFileSync('tmp-cms-scrape-expr.js', expr)
console.log('len', expr.length)
console.log(expr)
