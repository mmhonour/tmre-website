import 'server-only'

import { execute, query } from '@/lib/db/postgres'
import { TMRE_TOWNS, type TmreTown } from '@/lib/tmre-towns'

// ---------------------------------------------------------------------------
// Dirty-town tracking for the stats cache.
//
// The stats cache used to rebuild on a clock: every hour the TTL expired and
// all seven towns were recomputed whether or not a single number had moved.
// That is what put a full rebuild on a schedule it did not need, and what made
// the Railway sweep retry a fatal rebuild every 2.5 minutes.
//
// Instead the incremental sync marks a town dirty when a write actually moves a
// stats input (see upsertListing → statsChanged). A rebuild then recomputes the
// towns that are dirty, plus any town whose last rebuild is older than
// STATS_TOWN_MAX_AGE_MS as a backstop, and clears the marks it consumed.
//
// State lives in sync_meta, one row per town per kind, so marking is a single
// atomic upsert with no read-modify-write race between Netlify and Railway:
//   stats_dirty:<Town>  → ISO of the first unconsumed stats-moving write
//   stats_built:<Town>  → ISO of the last successful rebuild of that town
// ---------------------------------------------------------------------------

export const STATS_DIRTY_PREFIX = 'stats_dirty:'
export const STATS_BUILT_PREFIX = 'stats_built:'

/**
 * Backstop age. `dom` is in the dirty signature, and the MLS increments it daily
 * for every live listing, so a town with inventory goes dirty on its own once a
 * day. This only covers towns where nothing at all moved.
 */
export const STATS_TOWN_MAX_AGE_MS = 24 * 60 * 60 * 1000

/** sync_meta key holding the JSON summary of the last rebuild (Sync dashboard). */
export const STATS_CACHE_LAST_RUN_KEY = 'stats_cache_last_run'

export type StatsRebuildReason = 'dirty' | 'never-built' | 'stale'

export type StatsTownStatus = {
  town: TmreTown
  /** First unconsumed stats-moving write, or null when clean. */
  dirtySince: string | null
  /** Last successful rebuild of this town, or null when never built. */
  builtAt: string | null
  /** Why this town would rebuild now — null when it is up to date. */
  reason: StatsRebuildReason | null
}

export type StatsCacheLastRun = {
  /** When the rebuild finished. */
  at: string
  /** Towns recomputed, or 'all' for a whole-cache rebuild. */
  towns: string[]
  /** What asked for it: dirty-sweep, backstop, admin button, deploy, … */
  trigger: string
  /** Per-town reason at the time the sweep picked them up. */
  reasons?: Record<string, StatsRebuildReason>
  written: number
  durationMs: number
  ok: boolean
  error?: string
}

function isTmreTown(value: string): value is TmreTown {
  return (TMRE_TOWNS as readonly string[]).includes(value)
}

function knownTowns(towns: readonly string[]): TmreTown[] {
  return [...new Set(towns.filter(isTmreTown))]
}

function dirtyKeys(towns: readonly string[]): string[] {
  return knownTowns(towns).map((town) => `${STATS_DIRTY_PREFIX}${town}`)
}

function builtKeys(towns: readonly string[]): string[] {
  return knownTowns(towns).map((town) => `${STATS_BUILT_PREFIX}${town}`)
}

/**
 * Mark towns dirty. `DO NOTHING` on conflict so the stored stamp stays the
 * *first* unconsumed write — that is the number the dashboard shows as "dirty
 * for 12m", and it is what makes the consume-on-clear check below safe.
 */
export async function markStatsTownsDirty(
  towns: readonly string[],
  at = new Date().toISOString(),
): Promise<void> {
  const keys = dirtyKeys(towns)
  if (keys.length === 0) return
  await execute(
    `INSERT INTO sync_meta (key, value)
     SELECT k, $2 FROM unnest($1::text[]) AS k
     ON CONFLICT (key) DO NOTHING`,
    [keys, at],
  )
}

/** Read dirty / last-built state for every TMRE town in one query. */
export async function readStatsTownStatuses(
  now = Date.now(),
): Promise<StatsTownStatus[]> {
  const rows = await query<{ key: string; value: string }>(
    `SELECT key, value FROM sync_meta
      WHERE key LIKE $1 || '%' OR key LIKE $2 || '%'`,
    [STATS_DIRTY_PREFIX, STATS_BUILT_PREFIX],
  )
  const dirty = new Map<string, string>()
  const built = new Map<string, string>()
  for (const row of rows) {
    if (row.key.startsWith(STATS_DIRTY_PREFIX)) {
      dirty.set(row.key.slice(STATS_DIRTY_PREFIX.length), row.value)
    } else if (row.key.startsWith(STATS_BUILT_PREFIX)) {
      built.set(row.key.slice(STATS_BUILT_PREFIX.length), row.value)
    }
  }
  return TMRE_TOWNS.map((town) => {
    const dirtySince = dirty.get(town) ?? null
    const builtAt = built.get(town) ?? null
    const builtMs = builtAt ? Date.parse(builtAt) : Number.NaN
    const reason: StatsRebuildReason | null = dirtySince
      ? 'dirty'
      : !Number.isFinite(builtMs)
        ? 'never-built'
        : now - builtMs >= STATS_TOWN_MAX_AGE_MS
          ? 'stale'
          : null
    return { town, dirtySince, builtAt, reason }
  })
}

/** Towns that should rebuild now, with the reason each one qualified. */
export async function statsTownsDueForRebuild(now = Date.now()): Promise<{
  towns: TmreTown[]
  reasons: Record<string, StatsRebuildReason>
}> {
  const statuses = await readStatsTownStatuses(now)
  const towns: TmreTown[] = []
  const reasons: Record<string, StatsRebuildReason> = {}
  for (const status of statuses) {
    if (!status.reason) continue
    towns.push(status.town)
    reasons[status.town] = status.reason
  }
  return { towns, reasons }
}

/**
 * Record a successful rebuild of `towns` and consume their dirty marks.
 *
 * Only marks stamped at or before `consumedThrough` (the rebuild's start time)
 * are cleared: a write that landed *while* the rebuild was reading stays dirty,
 * so the next sweep picks it up instead of silently dropping it.
 */
export async function clearStatsTownsDirty(
  towns: readonly string[],
  consumedThrough: string,
  builtAt = new Date().toISOString(),
): Promise<void> {
  const dirty = dirtyKeys(towns)
  if (dirty.length === 0) return
  await execute(
    `DELETE FROM sync_meta WHERE key = ANY($1::text[]) AND value <= $2`,
    [dirty, consumedThrough],
  )
  await execute(
    `INSERT INTO sync_meta (key, value)
     SELECT k, $2 FROM unnest($1::text[]) AS k
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
    [builtKeys(towns), builtAt],
  )
}

/** Persist the one-line "what ran and why" the Sync dashboard reads. */
export async function recordStatsCacheRun(run: StatsCacheLastRun): Promise<void> {
  await execute(
    `INSERT INTO sync_meta (key, value)
     VALUES ($1, $2)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
    [STATS_CACHE_LAST_RUN_KEY, JSON.stringify(run)],
  )
}

/** Parse the last-run summary; null when absent or unreadable. */
export function parseStatsCacheLastRun(raw: string | null): StatsCacheLastRun | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as StatsCacheLastRun
    if (!parsed || typeof parsed.at !== 'string') return null
    return {
      ...parsed,
      towns: Array.isArray(parsed.towns) ? parsed.towns : [],
    }
  } catch {
    return null
  }
}

/** Read + parse the last-run summary in one call (Admin Syncs panel). */
export async function readStatsCacheLastRun(): Promise<StatsCacheLastRun | null> {
  const rows = await query<{ value: string }>(
    'SELECT value FROM sync_meta WHERE key = $1',
    [STATS_CACHE_LAST_RUN_KEY],
  )
  return parseStatsCacheLastRun(rows[0]?.value ?? null)
}

function agoLabel(iso: string | null, now = Date.now()): string {
  const ms = iso ? Date.parse(iso) : Number.NaN
  if (!Number.isFinite(ms)) return 'never'
  const mins = Math.max(0, Math.round((now - ms) / 60_000))
  if (mins < 60) return `${mins}m ago`
  const hours = Math.round(mins / 60)
  if (hours < 48) return `${hours}h ago`
  return `${Math.round(hours / 24)}d ago`
}

const REASON_LABEL: Record<StatsRebuildReason, string> = {
  dirty: 'changed',
  'never-built': 'never built',
  stale: '24h backstop',
}

/** One operator line for the last rebuild: which towns, why, how much, how long. */
export function formatStatsCacheLastRun(
  run: StatsCacheLastRun | null,
  now = Date.now(),
): string {
  if (!run) return 'No rebuild recorded yet'
  const scope =
    run.towns.length === 0
      ? 'no towns'
      : run.towns.length >= TMRE_TOWNS.length
        ? `all ${TMRE_TOWNS.length} towns`
        : run.towns.join(', ')
  // A manual / whole-cache run carries no per-town reasons; don't invent one.
  const why = new Set(
    run.towns
      .map((town) => run.reasons?.[town])
      .filter((reason): reason is StatsRebuildReason => reason != null)
      .map((reason) => REASON_LABEL[reason]),
  )
  const seconds = Math.max(1, Math.round(run.durationMs / 1000))
  const head = run.ok
    ? `Rebuilt ${scope}`
    : `Rebuild failed — ${run.error ?? 'wrote 0 entries'} (${scope})`
  return [
    head,
    run.ok ? `${run.written.toLocaleString()} entries in ${seconds}s` : null,
    `trigger ${run.trigger}${why.size > 0 ? ` (${[...why].join(', ')})` : ''}`,
    agoLabel(run.at, now),
  ]
    .filter(Boolean)
    .join(' · ')
}

/** One operator line for what is waiting: dirty towns, or all-current. */
export function formatStatsTownQueue(
  statuses: readonly StatsTownStatus[],
  now = Date.now(),
): string {
  const due = statuses.filter((s) => s.reason)
  if (due.length === 0) {
    let oldestMs = Number.POSITIVE_INFINITY
    let oldest: string | null = null
    for (const status of statuses) {
      const ms = status.builtAt ? Date.parse(status.builtAt) : Number.NaN
      if (!Number.isFinite(ms) || ms >= oldestMs) continue
      oldestMs = ms
      oldest = status.builtAt
    }
    return `All towns current — oldest rebuild ${agoLabel(oldest, now)}`
  }
  return `Queued: ${due
    .map(
      (s) =>
        `${s.town} (${REASON_LABEL[s.reason as StatsRebuildReason]}${
          s.dirtySince ? ` ${agoLabel(s.dirtySince, now)}` : ''
        })`,
    )
    .join(', ')}`
}
