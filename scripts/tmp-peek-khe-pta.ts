import { query } from '../lib/db/postgres'

async function main() {
  const rows = await query<{
    kind: string
    last_name: string
    first_name: string | null
    grade: string | null
    school: string | null
    grad_year: number | null
    teacher: string | null
    email: string | null
    phone: string | null
    address: string | null
  }>(
    `SELECT kind, last_name, first_name, grade, school, grad_year, teacher, email, phone, address
       FROM people
      ORDER BY last_name, first_name
      LIMIT 5`,
  )
  console.log(JSON.stringify(rows, null, 2))
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
