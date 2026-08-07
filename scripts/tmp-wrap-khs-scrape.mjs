import { readFileSync, writeFileSync } from 'node:fs'

const src =
  'C:/Users/tmark/.cursor/browser-logs/cdp-response-Runtime.evaluate-2026-08-06T19-53-40-244Z.json'
const raw = JSON.parse(readFileSync(src, 'utf8'))
const value = raw?.result?.result?.value ?? raw?.result?.value
if (!value?.rows?.length) {
  console.error('Unexpected shape', JSON.stringify(raw).slice(0, 400))
  process.exit(1)
}

// Safety: reclassify any student-looking rows mislabeled as parent
const GRADE_RE = /\((Kindergarten|Alumni|\d+(?:st|nd|rd|th))\)/i
function gradeMeta(name) {
  const m = name.match(GRADE_RE)
  if (!m) return { grade: '', gradYear: '' }
  const g = m[1]
  if (/alumni/i.test(g)) return { grade: 'Alumni', gradYear: '' }
  if (/kindergarten/i.test(g)) return { grade: 'Kindergarten', gradYear: '2038' }
  const n = parseInt(g, 10)
  if (!Number.isFinite(n)) return { grade: g, gradYear: '' }
  return { grade: g, gradYear: String(2038 - n) }
}
let kindFixed = 0
for (const r of value.rows) {
  if (GRADE_RE.test(r.name) && r.kind !== 'student') {
    kindFixed++
    const gm = gradeMeta(r.name)
    r.kind = 'student'
    r.grade = gm.grade
    r.grad_year = gm.gradYear
    r.school = gm.grade === 'Alumni' ? 'KHS Alumni' : 'KHS'
  }
}

const out = {
  result: {
    value: {
      source: 'kingshighwaypta',
      school: 'KHS',
      rows: value.rows,
    },
  },
}
writeFileSync('tmp-pta-khs-rescrape.json', JSON.stringify(out))

const students = value.rows.filter((r) => r.kind === 'student')
const sample = ['Apton', 'Angelico', 'Bailey', 'Berkowitz', 'Marks'].map((q) => ({
  q,
  rows: value.rows
    .filter((r) => new RegExp(q, 'i').test(r.name))
    .map((r) => ({ kind: r.kind, name: r.name, grade: r.grade })),
}))

console.log(
  JSON.stringify(
    {
      total: value.total ?? value.rows.length,
      students: students.length,
      parents: value.rows.length - students.length,
      multiStudentBlocks: value.multiStudentBlocks,
      kindFixed,
      sample,
    },
    null,
    2,
  ),
)
