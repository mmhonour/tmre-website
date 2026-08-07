import 'server-only'

import { query } from '@/lib/db/postgres'

let ensured = false

/** Idempotent DDL — Netlify may not run migrations on deploy. */
export async function ensureKhePtaTables(): Promise<void> {
  if (ensured) return
  await query(`
    CREATE TABLE IF NOT EXISTS khe_pta_households (
      id          text PRIMARY KEY,
      address     text,
      imported_at timestamptz NOT NULL DEFAULT now()
    )
  `)

  // Prefer rename of legacy table when present.
  await query(`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.tables
         WHERE table_schema = 'public' AND table_name = 'khe_pta_people'
      ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.tables
         WHERE table_schema = 'public' AND table_name = 'people'
      ) THEN
        ALTER TABLE khe_pta_people RENAME TO people;
      END IF;
    END $$
  `)

  await query(`
    CREATE TABLE IF NOT EXISTS people (
      id            text PRIMARY KEY,
      household_id  text NOT NULL REFERENCES khe_pta_households (id) ON DELETE CASCADE,
      kind          text NOT NULL CHECK (kind IN ('parent', 'student')),
      last_name     text NOT NULL,
      first_name    text,
      email         text,
      phone         text,
      address       text,
      grade         text,
      school        text,
      grad_year     integer,
      teacher       text,
      nickname      text,
      sort_order    integer NOT NULL DEFAULT 0,
      imported_at   timestamptz NOT NULL DEFAULT now()
    )
  `)
  await query(`
    ALTER TABLE people
      ADD COLUMN IF NOT EXISTS last_name text,
      ADD COLUMN IF NOT EXISTS first_name text
  `)

  const nameCol = await query<{ exists: boolean }>(
    `SELECT EXISTS (
       SELECT 1
         FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'people'
          AND column_name = 'name'
     ) AS exists`,
  )
  if (nameCol[0]?.exists) {
    await query(`
      UPDATE people
         SET last_name = NULLIF(btrim(split_part(name, ',', 1)), ''),
             first_name = NULLIF(
               btrim(substring(name from position(',' in name) + 1)),
               ''
             )
       WHERE (last_name IS NULL OR first_name IS NULL)
         AND position(',' in name) > 0
    `)
    await query(`
      UPDATE people
         SET last_name = NULLIF(btrim(name), '')
       WHERE last_name IS NULL
         AND position(',' in name) = 0
    `)
    await query(`
      UPDATE people
         SET last_name = COALESCE(NULLIF(btrim(last_name), ''), '(unknown)')
       WHERE last_name IS NULL OR btrim(last_name) = ''
    `)
    await query(`
      CREATE TABLE people__new (
        id            text PRIMARY KEY,
        household_id  text NOT NULL REFERENCES khe_pta_households (id) ON DELETE CASCADE,
        kind          text NOT NULL CHECK (kind IN ('parent', 'student')),
        last_name     text NOT NULL,
        first_name    text,
        email         text,
        phone         text,
        address       text,
        grade         text,
        school        text,
        grad_year     integer,
        teacher       text,
        nickname      text,
        sort_order    integer NOT NULL DEFAULT 0,
        imported_at   timestamptz NOT NULL DEFAULT now()
      )
    `)
    await query(`
      INSERT INTO people__new (
        id, household_id, kind, last_name, first_name,
        email, phone, address, grade, school, grad_year,
        teacher, nickname, sort_order, imported_at
      )
      SELECT
        id, household_id, kind, last_name, first_name,
        email, phone, address, grade, school, grad_year,
        teacher, nickname, sort_order, imported_at
      FROM people
    `)
    await query(`DROP TABLE people`)
    await query(`ALTER TABLE people__new RENAME TO people`)
  }

  await query(`
    UPDATE people
       SET last_name = COALESCE(NULLIF(btrim(last_name), ''), '(unknown)')
     WHERE last_name IS NULL OR btrim(last_name) = ''
  `)
  await query(`
    CREATE INDEX IF NOT EXISTS idx_people_last_first
      ON people (lower(last_name), lower(first_name))
  `)
  await query(`
    CREATE INDEX IF NOT EXISTS idx_people_household
      ON people (household_id)
  `)
  await query(`
    CREATE INDEX IF NOT EXISTS idx_people_kind_grade
      ON people (kind, grade)
  `)
  await query(`
    CREATE INDEX IF NOT EXISTS idx_people_grad_year
      ON people (grad_year)
      WHERE kind = 'student'
  `)
  await query(`
    CREATE INDEX IF NOT EXISTS idx_people_email
      ON people (lower(email))
      WHERE email IS NOT NULL AND email <> ''
  `)
  ensured = true
}

export type KhePtaPerson = {
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

/**
 * Split toolkit directory display names.
 * - Parents: "Last, First…" (extras stay in first; no middle column)
 * - Students: "First Last (5th)" / "First Last (Kindergarten)" — grade paren stripped
 */
export function splitDirectoryName(name: string): {
  lastName: string
  firstName: string | null
} {
  let trimmed = name.trim()
  if (!trimmed) return { lastName: '(unknown)', firstName: null }
  trimmed = trimmed
    .replace(/\s*\((Kindergarten|Alumni|\d+(?:st|nd|rd|th))\)\s*$/i, '')
    .trim()
  if (!trimmed) return { lastName: '(unknown)', firstName: null }

  const comma = trimmed.indexOf(',')
  if (comma >= 0) {
    const lastName = trimmed.slice(0, comma).trim() || '(unknown)'
    const firstName = trimmed.slice(comma + 1).trim() || null
    return { lastName, firstName }
  }

  const parts = trimmed.split(/\s+/).filter(Boolean)
  if (parts.length === 1) return { lastName: parts[0]!, firstName: null }
  return {
    lastName: parts[parts.length - 1]!,
    firstName: parts.slice(0, -1).join(' '),
  }
}

/** Toolkit-style display: "Last, First…" */
export function formatDirectoryName(
  lastName: string | null | undefined,
  firstName: string | null | undefined,
): string {
  const last = (lastName ?? '').trim()
  const first = (firstName ?? '').trim()
  if (last && first) return `${last}, ${first}`
  return last || first || ''
}

/** Students with parent contacts from the same household. */
export async function listKhePtaStudentsWithParents(): Promise<
  {
    student: KhePtaPerson
    parents: KhePtaPerson[]
  }[]
> {
  await ensureKhePtaTables()
  const students = await query<{
    id: string
    household_id: string
    kind: 'parent' | 'student'
    last_name: string
    first_name: string | null
    email: string | null
    phone: string | null
    address: string | null
    grade: string | null
    school: string | null
    grad_year: number | null
    teacher: string | null
    nickname: string | null
    sort_order: number
  }>(
    `SELECT id, household_id, kind, last_name, first_name, email, phone, address,
            grade, school, grad_year, teacher, nickname, sort_order
       FROM people
      WHERE kind = 'student'
      ORDER BY grad_year NULLS LAST, last_name, first_name`,
  )
  if (students.length === 0) return []

  const householdIds = [...new Set(students.map((s) => s.household_id))]
  const parents = await query<{
    id: string
    household_id: string
    kind: 'parent' | 'student'
    last_name: string
    first_name: string | null
    email: string | null
    phone: string | null
    address: string | null
    grade: string | null
    school: string | null
    grad_year: number | null
    teacher: string | null
    nickname: string | null
    sort_order: number
  }>(
    `SELECT id, household_id, kind, last_name, first_name, email, phone, address,
            grade, school, grad_year, teacher, nickname, sort_order
       FROM people
      WHERE kind = 'parent'
        AND household_id = ANY($1::text[])
      ORDER BY household_id, sort_order, last_name, first_name`,
    [householdIds],
  )

  const parentsByHousehold = new Map<string, KhePtaPerson[]>()
  for (const p of parents) {
    const list = parentsByHousehold.get(p.household_id) ?? []
    list.push(mapPerson(p))
    parentsByHousehold.set(p.household_id, list)
  }

  return students.map((s) => ({
    student: mapPerson(s),
    parents: parentsByHousehold.get(s.household_id) ?? [],
  }))
}

function mapPerson(row: {
  id: string
  household_id: string
  kind: 'parent' | 'student'
  last_name: string
  first_name: string | null
  email: string | null
  phone: string | null
  address: string | null
  grade: string | null
  school: string | null
  grad_year: number | null
  teacher: string | null
  nickname: string | null
  sort_order: number
}): KhePtaPerson {
  return {
    id: row.id,
    householdId: row.household_id,
    kind: row.kind,
    lastName: row.last_name,
    firstName: row.first_name,
    email: row.email,
    phone: row.phone,
    address: row.address,
    grade: row.grade,
    school: row.school,
    gradYear: row.grad_year,
    teacher: row.teacher,
    nickname: row.nickname,
    sortOrder: row.sort_order,
  }
}
