/**
 * Incremental health is two clocks, not one.
 *
 *   process   = last_mls_sync_heartbeat (is Railway mls-sync up?)
 *   inventory = last_incremental_sync End (did a pull finish into Neon?)
 *
 * Pink BROKEN is process-dead on Railway, or End-broken on legacy
 * Netlify/EventBridge. Overdue Next is Status/Next text, never row color.
 * A live process with a stale End is STALE, not BROKEN.
 */

export const INCREMENTAL_END_STALE_MS = 70 * 60 * 1000
/** Watchdog / cron alias — same window as inventory stale. */
export const INCREMENTAL_SYNC_STALE_MS = INCREMENTAL_END_STALE_MS

/** In-pull: mls-sync pulses ~60s during executeIncremental. */
export const RAILWAY_HEARTBEAT_RUNNING_MS = 3 * 60 * 1000
/**
 * Process up: idle pulse ~60s, or last run finish before that ships.
 * Pink only when heartbeat is older than this.
 */
export const RAILWAY_HEARTBEAT_ALIVE_MS = 45 * 60 * 1000

export type IncrementalHealthScheduler = 'railway' | 'eventbridge' | 'netlify'

export type IncrementalProcessHealth = 'running' | 'alive' | 'dead' | 'unknown'
export type IncrementalInventoryHealth = 'fresh' | 'stale' | 'missing'
export type IncrementalHealthRow = 'running' | 'ok' | 'alert' | 'idle'
export type IncrementalHealthPrefix = 'RUNNING' | 'BROKEN' | 'STALE' | null

export type IncrementalHealth = {
  process: IncrementalProcessHealth
  inventory: IncrementalInventoryHealth
  row: IncrementalHealthRow
  prefix: IncrementalHealthPrefix
  processAlive: boolean
  inPull: boolean
  inventoryStale: boolean
}

function parseIsoMs(iso: string | null | undefined): number | null {
  if (!iso) return null
  const ms = Date.parse(iso)
  return Number.isNaN(ms) ? null : ms
}

export function evaluateIncrementalHealth(input: {
  scheduler: IncrementalHealthScheduler
  heartbeatAt?: string | null
  finishedAt?: string | null
  startedAt?: string | null
  nowMs?: number
  /** Open Start without End still counts as in-pull under this age. */
  openStartMaxMs?: number
  liveInFlight?: boolean
}): IncrementalHealth {
  const nowMs = input.nowMs ?? Date.now()
  const openStartMaxMs = input.openStartMaxMs ?? RAILWAY_HEARTBEAT_ALIVE_MS
  const heartbeatMs = parseIsoMs(input.heartbeatAt)
  const finishedMs = parseIsoMs(input.finishedAt)
  const startedMs = parseIsoMs(input.startedAt)

  const inventory: IncrementalInventoryHealth =
    finishedMs == null
      ? 'missing'
      : nowMs - finishedMs >= INCREMENTAL_END_STALE_MS
        ? 'stale'
        : 'fresh'
  const inventoryStale = inventory !== 'fresh'

  const openStart =
    startedMs != null &&
    (finishedMs == null || startedMs > finishedMs) &&
    nowMs - startedMs < openStartMaxMs

  const heartbeatRunning =
    heartbeatMs != null && nowMs - heartbeatMs < RAILWAY_HEARTBEAT_RUNNING_MS
  const heartbeatAlive =
    heartbeatMs != null && nowMs - heartbeatMs < RAILWAY_HEARTBEAT_ALIVE_MS

  const railway = input.scheduler === 'railway'
  const inPull = Boolean(
    input.liveInFlight || (railway && (heartbeatRunning || openStart)),
  )

  let process: IncrementalProcessHealth = 'unknown'
  if (railway) {
    if (inPull) process = 'running'
    else if (heartbeatAlive || openStart) process = 'alive'
    else process = 'dead'
  }

  const processAlive = process === 'running' || process === 'alive'

  let row: IncrementalHealthRow = 'idle'
  let prefix: IncrementalHealthPrefix = null

  if (inPull) {
    row = 'running'
    prefix = 'RUNNING'
  } else if (railway) {
    if (!processAlive) {
      row = 'alert'
      prefix = 'BROKEN'
    } else if (inventoryStale) {
      row = 'idle'
      prefix = 'STALE'
    } else {
      row = 'ok'
    }
  } else if (inventoryStale) {
    row = 'alert'
    prefix = 'BROKEN'
  } else {
    row = 'ok'
  }

  return {
    process,
    inventory,
    row,
    prefix,
    processAlive,
    inPull,
    inventoryStale,
  }
}

/** Admin Sync now could not ring Railway /run — not proof the puller is dead. */
export function isMlsSyncDoorbellError(text: string | undefined): boolean {
  if (!text) return false
  const lower = text.toLowerCase()
  return (
    lower.includes('failed to parse url') ||
    lower.includes('mls_sync_service_url') ||
    lower.includes('could not queue incremental') ||
    /need https:\/\//i.test(text)
  )
}

export function formatRailwayHealthStrip(options: {
  health: IncrementalHealth
  heartbeatLabel: string
  endLabel: string
  upsertLabel?: string | null
  liveStatus?: string | null
}): string {
  const bits = [
    'Railway',
    options.heartbeatLabel,
    `End ${options.endLabel}`,
  ]
  if (options.upsertLabel?.trim()) bits.push(options.upsertLabel.trim())
  if (options.health.prefix) bits.unshift(options.health.prefix)
  if (options.liveStatus && options.health.inPull) {
    bits.push(options.liveStatus)
  }
  return bits.join(' · ')
}
