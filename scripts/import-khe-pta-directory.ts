/**
 * Import Kings Highway Elementary PTA directory CSV into Neon.
 *
 * Association: CSV row order from the Membership Toolkit scrape — runs of
 * parents followed by their students become one household (household_id).
 * Students then join to parents via that id.
 *
 *   npx tsx --env-file=.env.local --require ./scripts/stub-server-only.cjs scripts/import-khe-pta-directory.ts
 *
 * Optional:
 *   --csv=path\\to\\tmp-khe-pta-directory-full.csv
 *
 * Replaces all rows in khe_pta_households + people (full reload).
 */

import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { ensureKhePtaTables, splitDirectoryName } from '../lib/db/khe-pta-repo'
import { withTransaction } from '../lib/db/postgres'

type CsvRow = {
  kind: string
  name: string
  grade: string
  school: string
  grad_year: string
  teacher: string
  nickname: string
  email: string
  phone: string
  address: string
}

function parseCsv(text: string): CsvRow[] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        field += ch
      }
      continue
    }
    if (ch === '"') {
      inQuotes = true
      continue
    }
    if (ch === ',') {
      row.push(field)
      field = ''
      continue
    }
    if (ch === '\n') {
      row.push(field)
      field = ''
      if (row.length > 1 || row[0]) rows.push(row)
      row = []
      continue
    }
    if (ch === '\r') continue
    field += ch
  }
  if (field.length || row.length) {
    row.push(field)
    rows.push(row)
  }
  if (rows.length === 0) return []
  const header = rows[0]!.map((h) => h.trim())
  const idx = (name: string) => header.indexOf(name)
  const iKind = idx('kind')
  const iName = idx('name')
  if (iKind < 0 || iName < 0) {
    throw new Error(`CSV missing kind/name columns: ${header.join(',')}`)
  }
  return rows.slice(1).map((cells) => {
    const get = (name: string) => {
      const i = idx(name)
      return i >= 0 ? (cells[i] ?? '').trim() : ''
    }
    return {
      kind: get('kind'),
      name: get('name'),
      grade: get('grade'),
      school: get('school'),
      grad_year: get('grad_year'),
      teacher: get('teacher'),
      nickname: get('nickname'),
      email: get('email'),
      phone: get('phone'),
      address: get('address'),
    }
  }).filter((r) => r.name && (r.kind === 'parent' || r.kind === 'student'))
}

function nullIfEmpty(s: string): string | null {
  const t = s.trim()
  return t ? t : null
}

function parseGradYear(raw: string): number | null {
  const n = Number.parseInt(raw, 10)
  return Number.isFinite(n) ? n : null
}

async function main() {
  const csvArg = process.argv.find((a) => a.startsWith('--csv='))
  const csvPath = resolve(
    csvArg?.slice('--csv='.length) ||
      'tmp-khe-pta-directory-full.csv',
  )
  const raw = readFileSync(csvPath, 'utf8')
  const rows = parseCsv(raw)
  if (rows.length === 0) throw new Error(`No rows in ${csvPath}`)

  await ensureKhePtaTables()

  type PersonInsert = {
    id: string
    householdId: string
    kind: 'parent' | 'student'
    lastName: string
    firstName: string | null
    email: string | null
    phone: string | null
    address: string | null
    grade: string | null
    school: string | null
    gradYear: number | null
    teacher: string | null
    nickname: string | null
    sortOrder: number
  }

  const households = new Map<string, string | null>() // id -> address
  const people: PersonInsert[] = []

  let householdId: string | null = null
  let lastKind: 'parent' | 'student' | null = null
  let sortOrder = 0

  for (const row of rows) {
    const kind = row.kind as 'parent' | 'student'
    if (kind === 'parent') {
      if (lastKind !== 'parent' || !householdId) {
        householdId = randomUUID()
        households.set(householdId, nullIfEmpty(row.address))
        sortOrder = 0
      } else if (householdId && !households.get(householdId) && row.address) {
        households.set(householdId, nullIfEmpty(row.address))
      }
    } else {
      if (!householdId) {
        householdId = randomUUID()
        households.set(householdId, nullIfEmpty(row.address))
        sortOrder = 0
      }
    }

    const email = nullIfEmpty(row.email)
    const { lastName, firstName } = splitDirectoryName(row.name)
    people.push({
      id: randomUUID(),
      householdId: householdId!,
      kind,
      lastName,
      firstName,
      email,
      phone: nullIfEmpty(row.phone),
      address: nullIfEmpty(row.address),
      grade: kind === 'student' ? nullIfEmpty(row.grade) : null,
      school: kind === 'student' ? nullIfEmpty(row.school) || 'KHS' : null,
      gradYear: kind === 'student' ? parseGradYear(row.grad_year) : null,
      teacher: kind === 'student' ? nullIfEmpty(row.teacher) : null,
      nickname: kind === 'student' ? nullIfEmpty(row.nickname) : null,
      sortOrder: sortOrder++,
    })
    lastKind = kind
  }

  await withTransaction(async (client) => {
    await client.query('DELETE FROM people')
    await client.query('DELETE FROM khe_pta_households')

    for (const [id, address] of households) {
      await client.query(
        `INSERT INTO khe_pta_households (id, address) VALUES ($1, $2)`,
        [id, address],
      )
    }

    for (const p of people) {
      await client.query(
        `INSERT INTO people (
           id, household_id, kind, last_name, first_name,
           email, phone, address,
           grade, school, grad_year, teacher, nickname, sort_order
         ) VALUES (
           $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14
         )`,
        [
          p.id,
          p.householdId,
          p.kind,
          p.lastName,
          p.firstName,
          p.email,
          p.phone,
          p.address,
          p.grade,
          p.school,
          p.gradYear,
          p.teacher,
          p.nickname,
          p.sortOrder,
        ],
      )
    }
  })

  const students = people.filter((p) => p.kind === 'student').length
  const parents = people.filter((p) => p.kind === 'parent').length
  console.log(
    `[khe-pta] imported ${people.length} people (${parents} parents, ${students} students) in ${households.size} households from ${csvPath}`,
  )
}

main().catch((err) => {
  console.error('[khe-pta] import failed', err)
  process.exit(1)
})
