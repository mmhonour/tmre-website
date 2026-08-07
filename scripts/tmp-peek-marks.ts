import { query } from '../lib/db/postgres'

async function main() {
  const people = await query<{
    kind: string
    last_name: string
    first_name: string | null
    grade: string | null
    school: string | null
    grad_year: number | null
    email: string | null
    household_id: string
  }>(
    `SELECT kind, last_name, first_name, grade, school, grad_year, email, household_id
       FROM people
      WHERE lower(last_name) LIKE '%marks%'
         OR lower(first_name) LIKE '%marks%'
         OR lower(last_name) LIKE '%honour%'
         OR lower(coalesce(email,'')) LIKE '%tmarkst%'
         OR lower(coalesce(email,'')) LIKE '%mhonour%'
      ORDER BY household_id, kind, last_name, first_name`,
  )
  console.log(JSON.stringify(people, null, 2))
  console.log('count', people.length)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
