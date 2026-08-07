/**
 * Merge a second Membership Toolkit directory scrape into khe_pta_households + people.
 *
 * Parent match: email (lower) then normalized name.
 * - Empty existing fields filled from incoming.
 * - Both sides non-empty and different → diff row (existing kept).
 * Students always inserted as new relations on the matched household
 * (skip if same name+grade+school already in that household).
 *
 *   npx tsx --env-file=.env.local --require ./scripts/stub-server-only.cjs scripts/merge-pta-directory.ts --json=path\\to\\scrape.json
 */

import { randomUUID } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

import {
  ensureKhePtaTables,
  formatDirectoryName,
  splitDirectoryName,
} from '../lib/db/khe-pta-repo'
import { query, withTransaction } from '../lib/db/postgres'

type Incoming = {
  name: string
  kind: 'parent' | 'student'
  email: string
  phone: string
  address: string
  teacher: string
  nickname: string
  grade: string
  grad_year: string
  school: string
  page?: number
  parent_emails?: string[]
  parent_names?: string[]
}

type DbParent = {
  id: string
  household_id: string
  last_name: string
  first_name: string | null
  email: string | null
  phone: string | null
  address: string | null
}

type DiffRow = {
  match_key: string
  field: string
  existing: string
  incoming: string
  parent_name: string
  parent_email: string
  source: string
}

function normEmail(s: string | null | undefined): string {
  return (s ?? '').trim().toLowerCase()
}

function normName(s: string | null | undefined): string {
  return (s ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
}

function normField(s: string | null | undefined): string {
  return (s ?? '').trim().replace(/\s+/g, ' ')
}

function empty(s: string | null | undefined): boolean {
  return !normField(s)
}

function parseGrad(raw: string): number | null {
  const n = Number.parseInt(raw, 10)
  return Number.isFinite(n) ? n : null
}

function loadIncoming(jsonPath: string): {
  source: string
  school: string
  rows: Incoming[]
} {
  const raw = JSON.parse(readFileSync(jsonPath, 'utf8')) as {
    result?: { value?: { source?: string; school?: string; rows?: Incoming[] } }
  }
  const v = raw.result?.value
  if (!v?.rows?.length) throw new Error(`No rows in ${jsonPath}`)
  return {
    source: v.source ?? 'unknown',
    school: v.school ?? 'CMS',
    rows: v.rows.filter((r) => r.name && (r.kind === 'parent' || r.kind === 'student')),
  }
}

/** Split scrape into households (parent run → student run). */
function groupHouseholds(rows: Incoming[]): Incoming[][] {
  const groups: Incoming[][] = []
  let cur: Incoming[] = []
  let lastKind: string | null = null
  for (const r of rows) {
    if (r.kind === 'parent' && lastKind === 'student') {
      if (cur.length) groups.push(cur)
      cur = []
    }
    if (r.kind === 'parent' && lastKind !== 'parent' && cur.length === 0) {
      // start
    }
    cur.push(r)
    lastKind = r.kind
  }
  if (cur.length) groups.push(cur)
  return groups
}

async function main() {
  const jsonArg = process.argv.find((a) => a.startsWith('--json='))
  const jsonPath = resolve(
    jsonArg?.slice('--json='.length) ||
      process.argv[2] ||
      '',
  )
  if (!jsonPath) {
    throw new Error('Pass --json=path/to/cdp-response-….json')
  }

  const { source, school, rows } = loadIncoming(jsonPath)
  await ensureKhePtaTables()

  const existingParents = await query<DbParent>(
    `SELECT id, household_id, last_name, first_name, email, phone, address
       FROM people
      WHERE kind = 'parent'`,
  )
  const byEmail = new Map<string, DbParent>()
  const byName = new Map<string, DbParent[]>()
  for (const p of existingParents) {
    const em = normEmail(p.email)
    if (em) byEmail.set(em, p)
    const nm = normName(formatDirectoryName(p.last_name, p.first_name))
    const list = byName.get(nm) ?? []
    list.push(p)
    byName.set(nm, list)
  }

  const existingStudents = await query<{
    id: string
    household_id: string
    last_name: string
    first_name: string | null
    grade: string | null
    school: string | null
    teacher: string | null
  }>(
    `SELECT id, household_id, last_name, first_name, grade, school, teacher
       FROM people
      WHERE kind = 'student'`,
  )
  const studentKey = (
    h: string,
    last: string,
    first: string | null,
    grade: string,
    sch: string,
  ) =>
    `${h}|${normName(formatDirectoryName(last, first))}|${normName(grade)}|${normName(sch)}`
  const haveStudent = new Map<
    string,
    { id: string; teacher: string | null }
  >()
  for (const s of existingStudents) {
    haveStudent.set(
      studentKey(
        s.household_id,
        s.last_name,
        s.first_name,
        s.grade ?? '',
        s.school ?? '',
      ),
      { id: s.id, teacher: s.teacher },
    )
  }

  function cleanTeacher(raw: string): string {
    return normField(raw).replace(/^Team:\s*/i, '')
  }

  const diffs: DiffRow[] = []
  const fills: { parent: string; field: string; value: string }[] = []
  let parentsMatched = 0
  let parentsCreated = 0
  let studentsAdded = 0
  let studentsSkipped = 0
  let householdsCreated = 0
  const householdConflicts: string[] = []

  type Update = {
    id: string
    email: string | null
    phone: string | null
    address: string | null
    lastName: string
    firstName: string | null
  }
  const updates: Update[] = []
  type TeacherFill = { id: string; teacher: string }
  const teacherFills: TeacherFill[] = []
  type Insert = {
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
  const inserts: Insert[] = []
  const newHouseholds = new Map<string, string | null>()

  function matchParent(p: Incoming): DbParent | null {
    const em = normEmail(p.email)
    if (em && byEmail.has(em)) return byEmail.get(em)!
    const nm = normName(p.name)
    const list = byName.get(nm) ?? []
    if (list.length === 1) return list[0]!
    if (list.length > 1 && em) {
      const hit = list.find((x) => normEmail(x.email) === em)
      if (hit) return hit
    }
    return list.length === 1 ? list[0]! : null
  }

  function parentLabel(p: {
    last_name?: string
    first_name?: string | null
    lastName?: string
    firstName?: string | null
  }) {
    return formatDirectoryName(
      p.last_name ?? p.lastName,
      p.first_name ?? p.firstName,
    )
  }

  function mergeParentFields(existing: DbParent, incoming: Incoming) {
    const incomingSplit = splitDirectoryName(incoming.name)
    const next: Update = {
      id: existing.id,
      email: existing.email,
      phone: existing.phone,
      address: existing.address,
      lastName: existing.last_name,
      firstName: existing.first_name,
    }
    let changed = false
    const contactFields: Array<'email' | 'phone' | 'address'> = [
      'email',
      'phone',
      'address',
    ]
    for (const field of contactFields) {
      const oldVal = existing[field]
      const newVal = incoming[field]
      if (empty(oldVal) && !empty(newVal)) {
        next[field] = normField(newVal)
        fills.push({
          parent: parentLabel(existing),
          field,
          value: normField(newVal),
        })
        changed = true
      } else if (!empty(oldVal) && !empty(newVal)) {
        const a = field === 'email' ? normEmail(oldVal) : normField(oldVal)
        const b = field === 'email' ? normEmail(newVal) : normField(newVal)
        if (a !== b) {
          diffs.push({
            match_key:
              normEmail(existing.email) || normName(parentLabel(existing)),
            field,
            existing: normField(oldVal),
            incoming: normField(newVal),
            parent_name: parentLabel(existing),
            parent_email: existing.email ?? '',
            source,
          })
        }
      }
    }

    // Fill blank last/first from incoming toolkit name; diff when both differ.
    const nameParts: Array<{
      field: 'last_name' | 'first_name'
      oldVal: string | null
      newVal: string | null
      set: (v: string | null) => void
    }> = [
      {
        field: 'last_name',
        oldVal: existing.last_name,
        newVal: incomingSplit.lastName,
        set: (v) => {
          next.lastName = v || '(unknown)'
        },
      },
      {
        field: 'first_name',
        oldVal: existing.first_name,
        newVal: incomingSplit.firstName,
        set: (v) => {
          next.firstName = v
        },
      },
    ]
    for (const part of nameParts) {
      if (empty(part.oldVal) && !empty(part.newVal)) {
        part.set(normField(part.newVal))
        fills.push({
          parent: parentLabel(existing),
          field: part.field,
          value: normField(part.newVal),
        })
        changed = true
      } else if (!empty(part.oldVal) && !empty(part.newVal)) {
        if (normField(part.oldVal) !== normField(part.newVal)) {
          diffs.push({
            match_key:
              normEmail(existing.email) || normName(parentLabel(existing)),
            field: part.field,
            existing: normField(part.oldVal),
            incoming: normField(part.newVal),
            parent_name: parentLabel(existing),
            parent_email: existing.email ?? '',
            source,
          })
        }
      }
    }

    if (changed) {
      updates.push(next)
      const refreshed: DbParent = {
        ...existing,
        email: next.email,
        phone: next.phone,
        address: next.address,
        last_name: next.lastName,
        first_name: next.firstName,
      }
      if (normEmail(refreshed.email)) byEmail.set(normEmail(refreshed.email), refreshed)
      const nm = normName(parentLabel(refreshed))
      byName.set(
        nm,
        (byName.get(nm) ?? []).map((p) => (p.id === refreshed.id ? refreshed : p)),
      )
    }
  }

  const groups = groupHouseholds(rows)

  for (const group of groups) {
    const parents = group.filter((r) => r.kind === 'parent')
    const students = group.filter((r) => r.kind === 'student')

    const matches = parents
      .map((p) => ({ incoming: p, existing: matchParent(p) }))
    const matched = matches.filter((m) => m.existing)

    for (const m of matched) {
      parentsMatched++
      mergeParentFields(m.existing!, m.incoming)
    }

    let householdId: string | null = null
    const matchedHouseholdIds = [
      ...new Set(matched.map((m) => m.existing!.household_id)),
    ]
    if (matchedHouseholdIds.length === 1) {
      householdId = matchedHouseholdIds[0]!
    } else if (matchedHouseholdIds.length > 1) {
      householdId = matchedHouseholdIds[0]!
      householdConflicts.push(
        `Parents in one ${school} household matched multiple DB households (${matchedHouseholdIds.join(', ')}); used ${householdId}. Parents: ${parents.map((p) => p.name).join('; ')}`,
      )
    }

    if (!householdId) {
      householdId = randomUUID()
      newHouseholds.set(
        householdId,
        normField(parents.find((p) => p.address)?.address || '') || null,
      )
      householdsCreated++
    }

    let sortOrder = 1000 // after existing members
    for (const m of matches) {
      if (m.existing) continue
      parentsCreated++
      const id = randomUUID()
      const email = normField(m.incoming.email) || null
      const nameSplit = splitDirectoryName(m.incoming.name)
      const row: Insert = {
        id,
        householdId,
        kind: 'parent',
        lastName: nameSplit.lastName,
        firstName: nameSplit.firstName,
        email,
        phone: normField(m.incoming.phone) || null,
        address: normField(m.incoming.address) || null,
        grade: null,
        school: null,
        gradYear: null,
        teacher: null,
        nickname: null,
        sortOrder: sortOrder++,
      }
      inserts.push(row)
      const dbParent: DbParent = {
        id,
        household_id: householdId,
        last_name: row.lastName,
        first_name: row.firstName,
        email: row.email,
        phone: row.phone,
        address: row.address,
      }
      if (email) byEmail.set(normEmail(email), dbParent)
      const nm = normName(parentLabel(dbParent))
      byName.set(nm, [...(byName.get(nm) ?? []), dbParent])
    }

    for (const s of students) {
      const sch = normField(s.school) || school
      const sSplit = splitDirectoryName(s.name)
      const key = studentKey(
        householdId,
        sSplit.lastName,
        sSplit.firstName,
        s.grade,
        sch,
      )
      const incomingTeacher = cleanTeacher(s.teacher) || null
      const existing = haveStudent.get(key)
      if (existing) {
        studentsSkipped++
        if (empty(existing.teacher) && incomingTeacher) {
          teacherFills.push({ id: existing.id, teacher: incomingTeacher })
          existing.teacher = incomingTeacher
        }
        continue
      }
      haveStudent.set(key, { id: 'pending', teacher: incomingTeacher })
      studentsAdded++
      inserts.push({
        id: randomUUID(),
        householdId,
        kind: 'student',
        lastName: sSplit.lastName,
        firstName: sSplit.firstName,
        email: null,
        phone: null,
        address: null,
        grade: normField(s.grade) || null,
        school: sch,
        gradYear: parseGrad(s.grad_year),
        teacher: incomingTeacher,
        nickname: normField(s.nickname) || null,
        sortOrder: sortOrder++,
      })
    }
  }

  await withTransaction(async (client) => {
    for (const [id, address] of newHouseholds) {
      await client.query(
        `INSERT INTO khe_pta_households (id, address) VALUES ($1, $2)`,
        [id, address],
      )
    }
    for (const u of updates) {
      await client.query(
        `UPDATE people
            SET email = $2, phone = $3, address = $4,
                last_name = $5, first_name = $6
          WHERE id = $1`,
        [u.id, u.email, u.phone, u.address, u.lastName, u.firstName],
      )
    }
    for (const t of teacherFills) {
      await client.query(`UPDATE people SET teacher = $2 WHERE id = $1`, [
        t.id,
        t.teacher,
      ])
    }
    for (const p of inserts) {
      await client.query(
        `INSERT INTO people (
           id, household_id, kind, last_name, first_name,
           email, phone, address,
           grade, school, grad_year, teacher, nickname, sort_order
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
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

  const diffPath = resolve(`tmp-pta-parent-diffs-${source}.csv`)
  const header = 'parent_name,parent_email,field,existing,incoming,source\n'
  const body = diffs
    .map((d) =>
      [d.parent_name, d.parent_email, d.field, d.existing, d.incoming, d.source]
        .map((c) => `"${String(c).replace(/"/g, '""')}"`)
        .join(','),
    )
    .join('\n')
  writeFileSync(diffPath, header + body + (body ? '\n' : ''), 'utf8')

  const fillPath = resolve(`tmp-pta-parent-fills-${source}.csv`)
  writeFileSync(
    fillPath,
    'parent,field,value\n' +
      fills
        .map((f) =>
          [f.parent, f.field, f.value]
            .map((c) => `"${String(c).replace(/"/g, '""')}"`)
            .join(','),
        )
        .join('\n') +
      (fills.length ? '\n' : ''),
    'utf8',
  )

  console.log(`[pta-merge] source=${source} school=${school}`)
  console.log(`[pta-merge] incoming rows=${rows.length} households=${groups.length}`)
  console.log(`[pta-merge] parents matched=${parentsMatched} created=${parentsCreated}`)
  console.log(`[pta-merge] students added=${studentsAdded} skipped_dup=${studentsSkipped}`)
  console.log(`[pta-merge] student teacher/team fills=${teacherFills.length}`)
  console.log(`[pta-merge] households created=${householdsCreated}`)
  console.log(`[pta-merge] parent field fills=${fills.length}`)
  console.log(`[pta-merge] parent diffs=${diffs.length} → ${diffPath}`)
  console.log(`[pta-merge] fills log → ${fillPath}`)
  if (householdConflicts.length) {
    console.log(`[pta-merge] household conflicts=${householdConflicts.length}`)
    for (const c of householdConflicts) console.log(`  ! ${c}`)
  }
  if (diffs.length) {
    console.log('[pta-merge] --- parent diffs (existing kept) ---')
    for (const d of diffs.slice(0, 40)) {
      console.log(
        `  ${d.parent_name} | ${d.field}: existing=${JSON.stringify(d.existing)} incoming=${JSON.stringify(d.incoming)}`,
      )
    }
    if (diffs.length > 40) console.log(`  … +${diffs.length - 40} more in CSV`)
  }
}

main().catch((err) => {
  console.error('[pta-merge] failed', err)
  process.exit(1)
})
