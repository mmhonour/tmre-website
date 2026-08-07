/**
 * Non-PII audit: how many student vs parent names look like toolkit formats.
 *   npx tsx --env-file=.env.local --require ./scripts/stub-server-only.cjs scripts/tmp-pta-name-audit.ts
 */
import { readFileSync } from 'node:fs'
import { query } from '../lib/db/postgres'

function csvKindCounts(path: string) {
  const text = readFileSync(path, 'utf8')
  let parents = 0
  let students = 0
  let studentComma = 0
  let studentNoComma = 0
  let studentParen = 0
  for (const line of text.split(/\r?\n/).slice(1)) {
    if (!line.trim()) continue
    if (line.startsWith('"parent"')) parents++
    else if (line.startsWith('"student"')) {
      students++
      const m = line.match(/^"student","([^"]*)"/)
      const name = m?.[1] ?? ''
      if (name.includes(',')) studentComma++
      else studentNoComma++
      if (/\(\s*\d|Kindergarten|Pre-K/i.test(name)) studentParen++
    }
  }
  return { parents, students, studentComma, studentNoComma, studentParen }
}

async function main() {
  const csv = csvKindCounts('tmp-khe-pta-directory-full.csv')
  console.log('csv', csv)

  const db = await query<{
    kind: string
    n: string
    null_first: string
    has_comma_in_last: string
    last_has_paren: string
    last_has_space: string
  }>(
    `SELECT kind,
            count(*)::text AS n,
            count(*) FILTER (WHERE first_name IS NULL OR btrim(first_name) = '')::text AS null_first,
            count(*) FILTER (WHERE last_name LIKE '%,%')::text AS has_comma_in_last,
            count(*) FILTER (WHERE last_name ~ '\\(')::text AS last_has_paren,
            count(*) FILTER (WHERE last_name LIKE '% %')::text AS last_has_space
       FROM khe_pta_people
      GROUP BY kind
      ORDER BY kind`,
  )
  console.log('db', db)

  const multi = await query<{ n: string }>(
    `SELECT count(*)::text AS n FROM (
       SELECT household_id
         FROM khe_pta_people
        WHERE kind = 'student'
        GROUP BY household_id
       HAVING count(*) > 1
     ) t`,
  )
  console.log('households_with_2plus_students', multi[0]?.n)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
