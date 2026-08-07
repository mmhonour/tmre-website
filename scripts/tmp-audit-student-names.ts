import { query } from '../lib/db/postgres'
import { splitDirectoryName } from '../lib/db/khe-pta-repo'

async function main() {
  const summary = await query<{
    n: string
    null_first: string
    last_has_space: string
    last_has_paren: string
    looks_ok: string
  }>(
    `SELECT count(*)::text AS n,
            count(*) FILTER (WHERE first_name IS NULL OR btrim(first_name) = '')::text AS null_first,
            count(*) FILTER (WHERE last_name LIKE '% %')::text AS last_has_space,
            count(*) FILTER (WHERE last_name ~ '\\(')::text AS last_has_paren,
            count(*) FILTER (
              WHERE first_name IS NOT NULL AND btrim(first_name) <> ''
                AND last_name NOT LIKE '% %'
                AND last_name !~ '\\('
            )::text AS looks_ok
       FROM khe_pta_people
      WHERE kind = 'student'`,
  )
  console.log('summary', summary[0])

  const bad = await query<{
    last_name: string
    first_name: string | null
    school: string | null
    n: string
  }>(
    `SELECT last_name, first_name, school, count(*)::text AS n
       FROM khe_pta_people
      WHERE kind = 'student'
        AND (
          first_name IS NULL OR btrim(first_name) = ''
          OR last_name LIKE '% %'
          OR last_name ~ '\\('
        )
      GROUP BY last_name, first_name, school
      ORDER BY count(*) DESC
      LIMIT 15`,
  )
  console.log('bad_sample', bad)

  const marks = await query<{
    last_name: string
    first_name: string | null
    grade: string | null
    school: string | null
  }>(
    `SELECT last_name, first_name, grade, school
       FROM khe_pta_people
      WHERE kind = 'student' AND lower(last_name) = 'marks'
      ORDER BY grade`,
  )
  console.log('marks', marks)

  // sanity: parser on a few display strings
  for (const s of [
    'Elowyn Marks (2nd)',
    'Theodore Marks (6th)',
    'Madeleine Marks (8th)',
  ]) {
    console.log(s, '=>', splitDirectoryName(s))
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
