import { query } from '../lib/db/postgres'

async function main() {
  const summary = await query<{
    school: string | null
    n: string
    with_teacher: string
  }>(
    `SELECT school,
            count(*)::text AS n,
            count(*) FILTER (WHERE teacher IS NOT NULL AND btrim(teacher) <> '')::text AS with_teacher
       FROM people
      WHERE kind = 'student'
      GROUP BY school
      ORDER BY school`,
  )
  console.log('by_school', summary)

  const sample = await query<{
    last_name: string
    first_name: string | null
    grade: string | null
    teacher: string | null
    sort_order: number
  }>(
    `SELECT last_name, first_name, grade, teacher, sort_order
       FROM people
      WHERE kind = 'student' AND school = 'CMS'
      ORDER BY last_name, first_name
      LIMIT 8`,
  )
  console.log('cms_sample', sample)

  const marks = await query<{
    last_name: string
    first_name: string | null
    grade: string | null
    teacher: string | null
    sort_order: number
  }>(
    `SELECT last_name, first_name, grade, teacher, sort_order
       FROM people
      WHERE kind = 'student'
        AND lower(last_name) = 'marks'
      ORDER BY school, grade`,
  )
  console.log('marks', marks)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
