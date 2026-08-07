import { query } from '../lib/db/postgres'

async function main() {
  const bySchool = await query<{ school: string | null; n: number }>(
    `SELECT school, count(*)::int AS n
       FROM people
      WHERE kind = 'student'
      GROUP BY school
      ORDER BY school`,
  )
  console.log('students_by_school', bySchool)

  const split = await query<{
    n: number
    null_first: number
    last_has_space: number
  }>(
    `SELECT count(*)::int AS n,
            count(*) FILTER (WHERE first_name IS NULL OR btrim(first_name)='')::int AS null_first,
            count(*) FILTER (WHERE last_name LIKE '% %')::int AS last_has_space
       FROM people
      WHERE kind = 'student'`,
  )
  console.log('student_name_split', split[0])

  const apton = await query<{
    last_name: string
    first_name: string | null
    grade: string | null
    school: string | null
  }>(
    `SELECT last_name, first_name, grade, school
       FROM people
      WHERE kind = 'student' AND lower(last_name) = 'apton'
      ORDER BY grade`,
  )
  console.log('apton', apton)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
