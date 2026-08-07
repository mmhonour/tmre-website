import { readFileSync, writeFileSync } from 'node:fs'

const src =
  'C:/Users/tmark/.cursor/browser-logs/cdp-response-Runtime.evaluate-2026-08-06T17-40-11-189Z.json'
const raw = JSON.parse(readFileSync(src, 'utf8'))
const value = raw?.result?.result?.value ?? raw?.result?.value
if (!value?.rows?.length) throw new Error('no rows')

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

let fixed = 0
for (const r of value.rows) {
  if (GRADE_RE.test(r.name)) {
    const gm = gradeMeta(r.name)
    if (r.kind !== 'student') fixed++
    r.kind = 'student'
    r.grade = gm.grade
    r.grad_year = gm.gradYear
    r.school = gm.grade === 'Alumni' ? 'CMS Alumni' : 'CMS'
    // clear parent contact fields wrongly left on student rows
    if (!r.email) r.email = ''
  }
}

// Rebuild household links in row order (parent run → student run)
let parents = []
for (const r of value.rows) {
  if (r.kind === 'parent') {
    // reset when previous was student — but we need previous kind
  }
}
parents = []
let prev = null
for (const r of value.rows) {
  if (r.kind === 'parent') {
    if (prev === 'student') parents = []
    parents.push(r)
    r.household_local = parents.map((p) => p.email || p.name).join('|')
    delete r.parent_emails
    delete r.parent_names
  } else {
    r.household_local = parents.map((p) => p.email || p.name).join('|')
    r.parent_emails = parents.map((p) => p.email).filter(Boolean)
    r.parent_names = parents.map((p) => p.name)
  }
  prev = r.kind
}

const out = {
  result: {
    value: {
      source: 'coleytownmspta',
      school: 'CMS',
      rows: value.rows,
    },
  },
}
writeFileSync('tmp-pta-cms-rescrape.json', JSON.stringify(out))

const students = value.rows.filter((r) => r.kind === 'student')
const marks = value.rows.filter((r) => /marks/i.test(r.name))
console.log(
  JSON.stringify(
    {
      total: value.rows.length,
      students: students.length,
      parents: value.rows.length - students.length,
      kindFixed: fixed,
      marks: marks.map((r) => ({
        kind: r.kind,
        name: r.name,
        grade: r.grade,
        school: r.school,
      })),
    },
    null,
    2,
  ),
)
