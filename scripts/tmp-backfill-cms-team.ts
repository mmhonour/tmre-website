/**
 * Backfill people.teacher for CMS students from rescrape JSON (Team → teacher).
 * Does not overwrite a non-empty teacher unless it is empty / whitespace.
 *
 *   npx tsx --env-file=.env.local --require ./scripts/stub-server-only.cjs scripts/tmp-backfill-cms-team.ts
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import {
  ensureKhePtaTables,
  formatDirectoryName,
  splitDirectoryName,
} from '../lib/db/khe-pta-repo'
import { query, withTransaction } from '../lib/db/postgres'

function normName(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ')
}

function cleanTeam(raw: string): string {
  return raw
    .trim()
    .replace(/^Team:\s*/i, '')
    .replace(/\s+/g, ' ')
    .trim()
}

async function main() {
  const jsonPath = resolve(
    process.argv.find((a) => a.startsWith('--json='))?.slice('--json='.length) ||
      'tmp-pta-cms-rescrape.json',
  )
  const raw = JSON.parse(readFileSync(jsonPath, 'utf8')) as {
    result?: { value?: { rows?: Array<{
      kind: string
      name: string
      grade: string
      school: string
      teacher: string
    }> } }
  }
  const rows = (raw.result?.value?.rows ?? []).filter(
    (r) => r.kind === 'student' && cleanTeam(r.teacher || ''),
  )
  if (!rows.length) throw new Error(`No students with team/teacher in ${jsonPath}`)

  await ensureKhePtaTables()

  const byKey = new Map<string, string>()
  for (const r of rows) {
    const { lastName, firstName } = splitDirectoryName(r.name)
    const key = [
      normName(formatDirectoryName(lastName, firstName)),
      normName(r.grade || ''),
      'cms',
    ].join('|')
    byKey.set(key, cleanTeam(r.teacher))
  }

  const existing = await query<{
    id: string
    last_name: string
    first_name: string | null
    grade: string | null
    teacher: string | null
  }>(
    `SELECT id, last_name, first_name, grade, teacher
       FROM people
      WHERE kind = 'student'
        AND school = 'CMS'`,
  )

  let updated = 0
  let already = 0
  let missing = 0
  await withTransaction(async (client) => {
    for (const e of existing) {
      const key = [
        normName(formatDirectoryName(e.last_name, e.first_name)),
        normName(e.grade || ''),
        'cms',
      ].join('|')
      const team = byKey.get(key)
      if (!team) {
        missing++
        continue
      }
      const cur = (e.teacher || '').trim()
      if (cur) {
        // Normalize "Team: …" leftovers even when already set.
        const cleaned = cleanTeam(cur)
        if (cleaned !== cur) {
          await client.query(`UPDATE people SET teacher = $2 WHERE id = $1`, [
            e.id,
            cleaned,
          ])
          updated++
        } else {
          already++
        }
        continue
      }
      await client.query(`UPDATE people SET teacher = $2 WHERE id = $1`, [
        e.id,
        team,
      ])
      updated++
    }
  })

  const after = await query<{ with_teacher: string }>(
    `SELECT count(*) FILTER (WHERE teacher IS NOT NULL AND btrim(teacher) <> '')::text AS with_teacher
       FROM people
      WHERE kind = 'student' AND school = 'CMS'`,
  )
  console.log(
    JSON.stringify(
      {
        scrapeWithTeam: rows.length,
        dbCmsStudents: existing.length,
        updated,
        alreadyHad: already,
        noScrapeMatch: missing,
        cmsWithTeacherNow: after[0]?.with_teacher,
      },
      null,
      2,
    ),
  )
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
