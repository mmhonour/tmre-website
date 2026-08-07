/**
 * Re-split student last_name/first_name when last_name still holds the full
 * display string ("First Last (5th)").
 */
import {
  ensureKhePtaTables,
  splitDirectoryName,
} from '../lib/db/khe-pta-repo'
import { query, withTransaction } from '../lib/db/postgres'

async function main() {
  await ensureKhePtaTables()
  const rows = await query<{
    id: string
    last_name: string
    first_name: string | null
  }>(
    `SELECT id, last_name, first_name
       FROM khe_pta_people
      WHERE kind = 'student'
        AND (
          first_name IS NULL
          OR btrim(first_name) = ''
          OR last_name ~ '\\('
          OR last_name LIKE '% %'
        )`,
  )
  let updated = 0
  await withTransaction(async (client) => {
    for (const r of rows) {
      const raw =
        r.first_name && !/\(/.test(r.last_name)
          ? `${r.first_name} ${r.last_name}`
          : r.last_name
      const { lastName, firstName } = splitDirectoryName(raw)
      if (lastName === r.last_name && (firstName || null) === (r.first_name || null))
        continue
      await client.query(
        `UPDATE khe_pta_people
            SET last_name = $2, first_name = $3
          WHERE id = $1`,
        [r.id, lastName, firstName],
      )
      updated++
    }
  })
  console.log(`[pta] fixed student names: ${updated}/${rows.length}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
