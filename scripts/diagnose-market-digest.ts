#!/usr/bin/env node
/**
 * Why did the Monday brief not go out?
 *
 * The week watermark alone cannot tell sent from skipped from never-alarmed, so
 * this reads the attempt/result stamps beside it, the owner and pause flags that
 * decide which host was even allowed to send, and the Railway heartbeat that
 * says whether that host was alive at the slot.
 */
import { existsSync } from 'node:fs'
import { getAllSyncMeta } from '../lib/db/sync-meta'
import { query } from '../lib/db/postgres'

if (existsSync('.env.local')) {
  process.loadEnvFile('.env.local')
}

const DIGEST_KEY_RE = /digest/i
const OWNER_KEYS = [
  'sync_schedule_config',
  'scheduled_sync_paused',
  'scheduled_sync_paused_jobs',
  'sync_next_override_market-digest',
  'last_mls_sync_heartbeat',
]

function ageLabel(iso: string | undefined): string {
  if (!iso) return 'never'
  const ms = Date.parse(iso)
  if (!Number.isFinite(ms)) return `unparsable (${iso})`
  const mins = Math.round((Date.now() - ms) / 60_000)
  if (mins < 60) return `${mins}m ago`
  const hours = Math.round(mins / 60)
  if (hours < 48) return `${hours}h ago`
  return `${Math.round(hours / 24)}d ago`
}

function show(label: string, value: string | undefined) {
  console.info(`${label.padEnd(38)} ${value ?? '(unset)'}`)
}

async function main() {
  const all = await getAllSyncMeta()

  console.info('=== digest stamps ===')
  for (const key of Object.keys(all).filter((k) => DIGEST_KEY_RE.test(k)).sort()) {
    show(key, all[key])
  }

  console.info('\n=== who owns it / is it paused ===')
  for (const key of OWNER_KEYS) {
    const raw = all[key]
    if (key === 'sync_schedule_config' && raw) {
      try {
        const cfg = JSON.parse(raw) as {
          jobs?: Record<string, unknown>
        }
        show('market-digest job config', JSON.stringify(cfg.jobs?.['market-digest'] ?? null))
      } catch {
        show('sync_schedule_config', '(unparsable JSON)')
      }
      continue
    }
    show(key, raw)
  }

  console.info('\n=== clocks ===')
  show('now', new Date().toISOString())
  show('last attempt', `${all['market_digest_last_attempt_at'] ?? '(never)'} — ${ageLabel(all['market_digest_last_attempt_at'])}`)
  show('last sent', `${all['market_digest_last_sent_at'] ?? '(never)'} — ${ageLabel(all['market_digest_last_sent_at'])}`)
  show('railway heartbeat', `${all['last_mls_sync_heartbeat'] ?? '(never)'} — ${ageLabel(all['last_mls_sync_heartbeat'])}`)

  // Railway owns several jobs by default. If its heartbeat is missing here, none
  // of them have an awake clock no matter what Configure says.
  console.info('\n=== host liveness (who is actually working this DB) ===')
  for (const key of [
    'last_mls_sync_heartbeat',
    'last_incremental_sync',
    'last_incremental_cron_tick',
    'last_eventbridge_ingress_at_incremental',
    'last_stats_cache',
    'last_listing_scores',
    'last_deal_of_the_day_cache',
    'property_addresses_synced_at',
    'last_full_sync',
  ]) {
    show(key, `${all[key] ?? '(never)'} — ${ageLabel(all[key])}`)
  }

  console.info('\n=== recent digest history rows ===')
  try {
    const rows = await query<{
      startedAt: string
      finishedAt: string | null
      statusBucket: string | null
      ok: boolean
      error: string | null
    }>(
      `SELECT to_char(started_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS "startedAt",
              to_char(finished_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS "finishedAt",
              status_bucket AS "statusBucket",
              ok,
              error
         FROM sync_runs
        WHERE status_bucket ILIKE '%digest%'
        ORDER BY started_at DESC
        LIMIT 12`,
    )
    if (rows.length === 0) {
      console.info('(no sync_runs rows tagged digest)')
    }
    for (const run of rows) {
      console.info(
        `${run.finishedAt ?? run.startedAt} ok=${run.ok} ${run.statusBucket ?? ''} ${run.error ?? ''}`,
      )
    }
  } catch (err) {
    console.info(`(sync_runs read failed: ${(err as Error).message})`)
  }

  const serviceUrl = process.env.MLS_SYNC_SERVICE_URL
  console.info('\n=== railway service ===')
  if (!serviceUrl) {
    console.info('MLS_SYNC_SERVICE_URL not set in this environment')
    return
  }
  try {
    const res = await fetch(`${serviceUrl.replace(/\/$/, '')}/health`, {
      signal: AbortSignal.timeout(10_000),
    })
    const body = (await res.json()) as Record<string, unknown>
    console.info(`GET /health → ${res.status}`)
    console.info(JSON.stringify(body.marketDigest ?? body, null, 1))
  } catch (err) {
    console.info(`/health unreachable: ${(err as Error).message}`)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
