/**
 * Incremental / EventBridge smoke test (CLI).
 *
 * Pass = finished-pull clock (End) is fresh AND every --mls id is in Neon.
 * Fail otherwise. AWS “last fired” alone never passes.
 *
 *   npm run smoke:incremental -- --mls=24196609,24196740
 *   npm run smoke:incremental -- --mls=24196609 --max-age-min=70
 *   npm run smoke:incremental -- --mls=24196609 --require-eb
 *
 * Uses DATABASE_URL from .env.local (same Neon the site uses).
 */

import { existsSync } from 'node:fs'
import { getSyncMeta } from '../lib/db/sync-meta'
import { query } from '../lib/db/postgres'

if (existsSync('.env.local')) {
  process.loadEnvFile('.env.local')
}

const DEFAULT_MAX_AGE_MIN = 70

type Args = {
  mlsIds: string[]
  maxAgeMin: number
  requireEb: boolean
}

function parseArgs(argv: string[]): Args {
  let maxAgeMin = DEFAULT_MAX_AGE_MIN
  let requireEb = false
  const mlsIds: string[] = []

  for (const raw of argv) {
    if (raw === '--require-eb') {
      requireEb = true
      continue
    }
    if (raw.startsWith('--max-age-min=')) {
      const n = Number(raw.slice('--max-age-min='.length))
      if (Number.isFinite(n) && n > 0) maxAgeMin = n
      continue
    }
    if (raw.startsWith('--mls=')) {
      for (const id of raw
        .slice('--mls='.length)
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)) {
        mlsIds.push(id)
      }
      continue
    }
    if (raw === '--help' || raw === '-h') {
      printHelp()
      process.exit(0)
    }
    if (!raw.startsWith('-') && /^\d+$/.test(raw)) {
      mlsIds.push(raw)
    }
  }

  return { mlsIds: [...new Set(mlsIds)], maxAgeMin, requireEb }
}

function printHelp(): void {
  console.log(`Incremental smoke test

Usage:
  npm run smoke:incremental -- --mls=24196609,24196740
  npm run smoke:incremental -- --mls=24196609 --max-age-min=70
  npm run smoke:incremental -- --mls=24196609 --require-eb

Checks:
  1) End (last_incremental_sync) exists and age ≤ max-age-min (default ${DEFAULT_MAX_AGE_MIN})
  2) Each MLS# exists in public.listings
  3) Optional --require-eb: EventBridge ingress also fired within max-age-min

Exit 0 = PASS. Exit 1 = FAIL.
`)
}

function ageMs(iso: string | null, nowMs: number): number | null {
  if (!iso?.trim()) return null
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return null
  return Math.max(0, nowMs - t)
}

function formatAge(ms: number | null): string {
  if (ms == null) return 'never'
  const min = Math.round(ms / 60_000)
  if (min < 60) return `${min}m ago`
  const h = Math.round(min / 60)
  if (h < 48) return `${h}h ago`
  return `${Math.round(h / 24)}d ago`
}

function line(ok: boolean, label: string, detail: string): void {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`)
  if (detail) console.log(`       ${detail}`)
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2))
  const nowMs = Date.now()
  const maxAgeMs = args.maxAgeMin * 60_000
  let failed = false

  console.log('=== Incremental smoke test ===')
  console.log(`time          ${new Date(nowMs).toISOString()}`)
  console.log(`max End age   ${args.maxAgeMin}m`)
  console.log(
    `MLS ids       ${args.mlsIds.length ? args.mlsIds.join(', ') : '(none — End clock only)'}`,
  )
  console.log('')

  const endAt = await getSyncMeta('last_incremental_sync')
  const startAt = await getSyncMeta('last_incremental_sync_started')
  const heartbeat = await getSyncMeta('last_mls_sync_heartbeat')
  const ebAt = await getSyncMeta('last_eventbridge_ingress_at_incremental')
  const ebResult = await getSyncMeta('last_eventbridge_ingress_result_incremental')

  const endAge = ageMs(endAt, nowMs)
  const endOk = endAge != null && endAge <= maxAgeMs
  if (!endOk) failed = true
  line(
    endOk,
    'End (finished pull)',
    endAt
      ? `${endAt} · ${formatAge(endAge)}`
      : 'MISSING (last_incremental_sync null) — Incremental not finishing',
  )

  const startAge = ageMs(startAt, nowMs)
  line(
    true,
    'Start (queued)',
    startAt ? `${startAt} · ${formatAge(startAge)}` : 'none',
  )

  const hbAge = ageMs(heartbeat, nowMs)
  line(
    true,
    'Railway mls-sync heartbeat',
    heartbeat ? `${heartbeat} · ${formatAge(hbAge)}` : 'never (service not running yet)',
  )

  const ebAge = ageMs(ebAt, nowMs)
  line(
    true,
    'EventBridge last fired (legacy doorbell)',
    ebAt
      ? `${ebAt} · ${formatAge(ebAge)}${ebResult ? ` · ${ebResult}` : ''}`
      : 'never',
  )

  if (args.requireEb) {
    const ebOk = ebAge != null && ebAge <= maxAgeMs
    if (!ebOk) failed = true
    line(
      ebOk,
      'EventBridge fresh (--require-eb)',
      ebOk
        ? `within ${args.maxAgeMin}m`
        : 'ingress missing or older than max-age (doorbell check failed)',
    )
  }

  if (args.mlsIds.length === 0) {
    console.log('')
    console.log(
      'NOTE  No --mls ids given. Clock-only check. For a real go-live smoke, pass known new MLS#s.',
    )
  } else {
    console.log('')
    const rows = await query<{
      mls_id: string
      town: string
      mls_status: string | null
      status_bucket: string
      address_street: string | null
      synced_at: Date | string
    }>(
      `SELECT mls_id, town, mls_status, status_bucket, address_street, synced_at
         FROM listings
        WHERE mls_id = ANY($1::text[])`,
      [args.mlsIds],
    )
    const byId = new Map(rows.map((r) => [r.mls_id, r]))
    for (const id of args.mlsIds) {
      const row = byId.get(id)
      const ok = Boolean(row)
      if (!ok) failed = true
      line(
        ok,
        `MLS ${id} in Neon`,
        row
          ? `${row.town} · ${row.address_street ?? '—'} · ${row.mls_status ?? row.status_bucket} · synced ${row.synced_at instanceof Date ? row.synced_at.toISOString() : String(row.synced_at)}`
          : 'NOT FOUND — listing never landed (or wrong DATABASE_URL)',
      )
    }
  }

  console.log('')
  if (failed) {
    console.log('RESULT  FAIL — Incremental is not delivering. Fix pulls before declaring EventBridge live.')
    process.exit(1)
  }
  console.log('RESULT  PASS — End is fresh and all requested MLS#s are in Neon.')
  process.exit(0)
}

main().catch((err) => {
  console.error('RESULT  FAIL — smoke test crashed')
  console.error(err)
  process.exit(1)
})
