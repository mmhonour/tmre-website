import 'server-only'

import { query, queryOne } from '@/lib/db/postgres'
import {
  CT_COUNTY_TOWN_SEED,
  CT_DEFAULT_ACTIVE_TOWNS,
  CT_DEFAULT_MLS_CITY_CODES,
  ctTownSlug,
} from '@/lib/ct-coverage-seed'

export type CtCoverageTown = {
  id: string
  name: string
  active: boolean
  mlsCityCode: string | null
  sortOrder: number
}

export type CtCoverageCounty = {
  id: string
  name: string
  sortOrder: number
  towns: CtCoverageTown[]
  activeCount: number
  townCount: number
}

let seedPromise: Promise<void> | null = null
let tablesPromise: Promise<void> | null = null

/**
 * Idempotent DDL — Netlify does not run `npm run db:migrate` on deploy, so
 * production can lag local after 0009 lands. Safe to call on every Admin load.
 */
export async function ensureCtCoverageTables(): Promise<void> {
  if (!tablesPromise) {
    tablesPromise = createCtCoverageTables().finally(() => {
      tablesPromise = null
    })
  }
  await tablesPromise
}

async function createCtCoverageTables(): Promise<void> {
  await query(`
    CREATE TABLE IF NOT EXISTS ct_counties (
      id          text PRIMARY KEY,
      name        text NOT NULL UNIQUE,
      sort_order  integer NOT NULL DEFAULT 0,
      created_at  timestamptz NOT NULL DEFAULT now(),
      updated_at  timestamptz NOT NULL DEFAULT now()
    )
  `)
  await query(`
    CREATE TABLE IF NOT EXISTS ct_towns (
      id              text PRIMARY KEY,
      name            text NOT NULL,
      county_id       text NOT NULL REFERENCES ct_counties (id) ON DELETE RESTRICT,
      active          boolean NOT NULL DEFAULT false,
      mls_city_code   text,
      sort_order      integer NOT NULL DEFAULT 0,
      created_at      timestamptz NOT NULL DEFAULT now(),
      updated_at      timestamptz NOT NULL DEFAULT now(),
      UNIQUE (county_id, name)
    )
  `)
  await query(`
    CREATE INDEX IF NOT EXISTS idx_ct_towns_county_id
      ON ct_towns (county_id)
  `)
  await query(`
    CREATE INDEX IF NOT EXISTS idx_ct_towns_active
      ON ct_towns (active)
      WHERE active
  `)
  await query(`
    CREATE INDEX IF NOT EXISTS idx_ct_towns_name_lower
      ON ct_towns (lower(name))
  `)
  // Best-effort bookkeeping — ignore if schema_migrations shape differs.
  try {
    await query(
      `INSERT INTO schema_migrations (version, applied_at)
       VALUES ('0009_ct_coverage_towns', now())
       ON CONFLICT (version) DO NOTHING`,
    )
  } catch {
    /* ignore */
  }
}

/**
 * Upsert the full CT catalog. Preserves Admin `active` toggles on re-seed
 * except first insert (defaults from CT_DEFAULT_ACTIVE_TOWNS).
 */
export async function ensureCtCoverageSeeded(): Promise<void> {
  if (!seedPromise) {
    seedPromise = (async () => {
      await ensureCtCoverageTables()
      await seedCtCoverage()
    })().finally(() => {
      seedPromise = null
    })
  }
  await seedPromise
}

async function seedCtCoverage(): Promise<void> {
  for (const county of CT_COUNTY_TOWN_SEED) {
    await query(
      `INSERT INTO ct_counties (id, name, sort_order, updated_at)
       VALUES ($1, $2, $3, now())
       ON CONFLICT (id) DO UPDATE SET
         name = EXCLUDED.name,
         sort_order = EXCLUDED.sort_order,
         updated_at = now()`,
      [county.id, county.name, county.sortOrder],
    )

    let townSort = 0
    for (const townName of county.towns) {
      townSort += 1
      const id = ctTownSlug(townName)
      const defaultActive = (CT_DEFAULT_ACTIVE_TOWNS as readonly string[]).includes(
        townName,
      )
      const mlsCode = CT_DEFAULT_MLS_CITY_CODES[townName] ?? null
      await query(
        `INSERT INTO ct_towns (
           id, name, county_id, active, mls_city_code, sort_order, updated_at
         ) VALUES ($1, $2, $3, $4, $5, $6, now())
         ON CONFLICT (id) DO UPDATE SET
           name = EXCLUDED.name,
           county_id = EXCLUDED.county_id,
           mls_city_code = COALESCE(EXCLUDED.mls_city_code, ct_towns.mls_city_code),
           sort_order = EXCLUDED.sort_order,
           updated_at = now()`,
        [id, townName, county.id, defaultActive, mlsCode, townSort],
      )
    }
  }
}

export async function listCtCoverageByCounty(): Promise<CtCoverageCounty[]> {
  await ensureCtCoverageSeeded()

  const counties = await query<{
    id: string
    name: string
    sort_order: number
  }>(
    `SELECT id, name, sort_order
       FROM ct_counties
      ORDER BY sort_order ASC, name ASC`,
  )

  const towns = await query<{
    id: string
    name: string
    county_id: string
    active: boolean
    mls_city_code: string | null
    sort_order: number
  }>(
    `SELECT id, name, county_id, active, mls_city_code, sort_order
       FROM ct_towns
      ORDER BY sort_order ASC, name ASC`,
  )

  const byCounty = new Map<string, CtCoverageTown[]>()
  for (const row of towns) {
    const list = byCounty.get(row.county_id) ?? []
    list.push({
      id: row.id,
      name: row.name,
      active: row.active,
      mlsCityCode: row.mls_city_code,
      sortOrder: row.sort_order,
    })
    byCounty.set(row.county_id, list)
  }

  return counties.map((c) => {
    const countyTowns = byCounty.get(c.id) ?? []
    return {
      id: c.id,
      name: c.name,
      sortOrder: c.sort_order,
      towns: countyTowns,
      townCount: countyTowns.length,
      activeCount: countyTowns.filter((t) => t.active).length,
    }
  })
}

export async function setCtTownActive(
  townId: string,
  active: boolean,
): Promise<CtCoverageTown | null> {
  await ensureCtCoverageSeeded()
  const id = townId.trim().toLowerCase()
  if (!id) throw new Error('townId required')

  const row = await queryOne<{
    id: string
    name: string
    active: boolean
    mls_city_code: string | null
    sort_order: number
  }>(
    `UPDATE ct_towns
        SET active = $2, updated_at = now()
      WHERE id = $1
      RETURNING id, name, active, mls_city_code, sort_order`,
    [id, active],
  )
  if (!row) return null
  return {
    id: row.id,
    name: row.name,
    active: row.active,
    mlsCityCode: row.mls_city_code,
    sortOrder: row.sort_order,
  }
}

/** Future helpers — not used by public pages yet. */
export async function listActiveCtTownNames(): Promise<string[]> {
  await ensureCtCoverageSeeded()
  const rows = await query<{ name: string }>(
    `SELECT name FROM ct_towns WHERE active ORDER BY name ASC`,
  )
  return rows.map((r) => r.name)
}
