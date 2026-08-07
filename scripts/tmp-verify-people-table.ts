import { query } from '../lib/db/postgres'

async function main() {
  const tables = await query<{ table_name: string }>(
    `SELECT table_name
       FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name IN ('people', 'khe_pta_people')
      ORDER BY table_name`,
  )
  console.log('tables', tables)
  const n = await query<{ c: number }>(`SELECT count(*)::int AS c FROM people`)
  console.log('people rows', n[0]?.c)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
