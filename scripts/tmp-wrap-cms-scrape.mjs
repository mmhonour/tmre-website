import { readFileSync, writeFileSync } from 'node:fs'

const src =
  'C:/Users/tmark/.cursor/browser-logs/cdp-response-Runtime.evaluate-2026-08-06T17-40-11-189Z.json'
const raw = JSON.parse(readFileSync(src, 'utf8'))
const value = raw?.result?.result?.value ?? raw?.result?.value ?? raw?.value
if (!value?.rows?.length) {
  console.error('Unexpected shape', Object.keys(raw?.result ?? raw ?? {}))
  process.exit(1)
}

const out = {
  result: {
    value: {
      source: value.source,
      school: value.school,
      rows: value.rows,
    },
  },
}
writeFileSync('tmp-pta-cms-rescrape.json', JSON.stringify(out))

const marks = value.sampleMarks || value.rows.filter((r) => /marks/i.test(r.name))
console.log(
  JSON.stringify(
    {
      total: value.total,
      students: value.students,
      parents: value.parents,
      multiStudentBlocks: value.multiStudentBlocks,
      marks: marks.map((r) => ({ kind: r.kind, name: r.name, grade: r.grade, school: r.school })),
      prevStudentsApprox: 400,
    },
    null,
    2,
  ),
)
