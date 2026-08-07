import { readFileSync } from 'node:fs'

const text = readFileSync('tmp-khe-pta-directory-full.csv', 'utf8')
const rows = text.split(/\r?\n/).slice(1).filter(Boolean)
let streak = 0
let multi = 0
let max = 0
const examples = []
for (const line of rows) {
  if (line.startsWith('"student"')) {
    streak++
  } else {
    if (streak > 1) {
      multi++
      max = Math.max(max, streak)
    }
    streak = 0
  }
}
if (streak > 1) {
  multi++
  max = Math.max(max, streak)
}
// also count students total vs parent households
let students = 0
let households = 0
let last = null
for (const line of rows) {
  if (line.startsWith('"parent"')) {
    if (last === 'student' || last === null) households++
    last = 'parent'
  } else if (line.startsWith('"student"')) {
    students++
    last = 'student'
  }
}
console.log({ students, householdsApprox: households, multiStudentStreaks: multi, maxStreak: max })
