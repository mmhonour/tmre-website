/**
 * vision_streets table smoke (CLI).
 *
 * Writes only under town `__smoke` and deletes it before exit.
 *
 *   npm run smoke:vision-streets
 */

import { streetNamesFromLetterHtml } from '../lib/vision-gis-parse'
import {
  countVisionStreets,
  ensureVisionStreetsTable,
  listVisionStreetLetters,
  listVisionStreets,
  replaceVisionStreetsForLetter,
} from '../lib/db/vision-streets-repo'
import { missingVisionStreetLetters } from '../lib/vision-gis-towns'
import { execute } from '../lib/db/postgres'

const TOWN = '__smoke'
const URL_C = 'https://gis.vgsi.com/westportct/Streets.aspx?Letter=C'
const URL_A = 'https://gis.vgsi.com/westportct/Streets.aspx?Letter=A'

function assert(cond: unknown, message: string): asserts cond {
  if (!cond) throw new Error(message)
}

async function main() {
  console.log('vision streets smoke')
  await ensureVisionStreetsTable()
  await execute(`DELETE FROM vision_streets WHERE town = $1`, [TOWN])
  console.log('PASS  vision_streets exists')

  const sampleHtml = `
    <a href="Streets.aspx?Name=Compo+Road+South">Compo Road South</a>
    <a href="Streets.aspx?Name=Cross%20Highway">Cross Highway</a>
    <a href="Streets.aspx?Name=Compo+Road+South">Compo Road South</a>
  `
  const parsed = streetNamesFromLetterHtml(sampleHtml)
  assert(parsed.length === 2, `parser expected 2 unique names, got ${parsed.length}`)
  assert(parsed.includes('Compo Road South'), 'parser missed Compo Road South')
  console.log('PASS  Streets.aspx?Name= parser')

  const first = await replaceVisionStreetsForLetter(
    TOWN,
    'C',
    parsed,
    URL_C,
  )
  assert(first.written === 2, `expected written 2, got ${first.written}`)
  await replaceVisionStreetsForLetter(TOWN, 'A', ['Adams Lane'], URL_A)
  const all = await listVisionStreets(TOWN)
  assert(all.length === 3, `expected 3 streets, got ${all.length}`)
  console.log('PASS  two letters sit side by side')

  const letters = await listVisionStreetLetters(TOWN)
  assert(letters.join('') === 'AC', `letters expected AC, got ${letters.join('')}`)
  const missing = missingVisionStreetLetters(letters)
  assert(!missing.includes('A') && !missing.includes('C'), 'A and C should not be missing')
  assert(missing[0] === 'B', `first missing should be B, got ${missing[0]}`)
  assert(
    missingVisionStreetLetters(['B']).includes('A'),
    'mid-crawl B-only must still list A as missing',
  )
  console.log('PASS  missing letters ignore already-stored buckets')

  const second = await replaceVisionStreetsForLetter(
    TOWN,
    'C',
    ['Compo Road South'],
    URL_C,
  )
  assert(second.written === 1, `expected written 1, got ${second.written}`)
  const after = await listVisionStreets(TOWN)
  const names = after.map((s) => s.streetName).sort()
  assert(
    names.join('|') === 'Adams Lane|Compo Road South',
    `letter replace spilled: ${names.join('|')}`,
  )
  console.log('PASS  letter replace does not touch other letters')

  const n = await countVisionStreets(TOWN)
  assert(n === 2, `count expected 2, got ${n}`)
  await execute(`DELETE FROM vision_streets WHERE town = $1`, [TOWN])
  console.log('PASS  cleanup')
  console.log('PASSED')
}

main().catch((err) => {
  console.error('FAILED', err instanceof Error ? err.message : err)
  process.exit(1)
})
