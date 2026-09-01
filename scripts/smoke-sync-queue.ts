/**
 * Sync queue smoke test (CLI).
 *
 * Answers the only question that matters after deploying the queue: is
 * something actually claiming work, and does a job put on the queue reach a
 * terminal state?
 *
 *   npm run smoke:sync-queue                          # read-only preflight
 *   npm run smoke:sync-queue -- --enqueue=stats-cache # round-trip a real job
 *   npm run smoke:sync-queue -- --enqueue=stats-cache --wait-min=20
 *
 * Reads DATABASE_URL from .env.local, or from the environment when you want to
 * aim it somewhere else (a Neon branch). Read-only mode writes nothing and is
 * safe against production; --enqueue really runs the job you name, so name one
 * you are happy to run.
 *
 * Exit 0 only when every check passes, so it can gate a rollout step.
 */

import { existsSync } from 'node:fs'

import { getSyncMeta } from '../lib/db/sync-meta'
import { query } from '../lib/db/postgres'
import {
  SYNC_QUEUE_DRAIN_HEARTBEAT_KEY,
  SYNC_QUEUE_RUNNER_STALE_MS,
  enqueueSyncJob,
  readSyncQueueSnapshot,
} from '../lib/sync-queue'
import {
  SYNC_QUEUE_PRIORITY_MANUAL,
  SYNC_QUEUE_RUNNER_JOBS,
  isSyncQueueRunnerJob,
  syncQueueOutcomeLabel,
} from '../lib/sync-queue-shared'

if (existsSync('.env.local')) {
  process.loadEnvFile('.env.local')
}

const DEFAULT_WAIT_MIN = 15
const POLL_MS = 5_000

/**
 * Say which database this is about to talk to, host and name only.
 *
 * This tool is read-only by default but `--enqueue` is not, and the whole point
 * of it is to be pointed at different databases during a rollout. Being told
 * which one you hit belongs at the top of the output, not in your memory of
 * which shell you are in.
 */
function describeTarget(): string {
  const raw = (
    process.env.DATABASE_URL ??
    process.env.NETLIFY_DATABASE_URL ??
    ''
  ).trim()
  try {
    const u = new URL(raw)
    return `${u.hostname}${u.pathname}`
  } catch {
    return 'unparseable connection string'
  }
}

/**
 * The library throws a perfectly good error for this, but it arrives as a stack
 * trace from four frames deep. An operator midway through a deploy should be
 * told what to do, not handed a traceback.
 */
function assertDatabaseUrl(): void {
  if (
    process.env.DATABASE_URL?.trim() ||
    process.env.NETLIFY_DATABASE_URL?.trim()
  ) {
    return
  }
  console.error(
    'DATABASE_URL is not set, so there is no database to check.\n\n' +
      'Normally it comes from .env.local in the repo root:\n' +
      '    DATABASE_URL=postgres://…  (the pooled Neon string, same one Netlify uses)\n\n' +
      'To aim at a different database for one run instead:\n' +
      '    PowerShell   $env:DATABASE_URL="postgres://…"; npm run smoke:sync-queue\n' +
      '    bash/zsh     DATABASE_URL="postgres://…" npm run smoke:sync-queue',
  )
  process.exit(1)
}

type Args = { enqueue: string | null; waitMin: number }

function parseArgs(argv: string[]): Args {
  let enqueue: string | null = null
  let waitMin = DEFAULT_WAIT_MIN
  for (const raw of argv) {
    if (raw.startsWith('--enqueue=')) enqueue = raw.slice('--enqueue='.length)
    else if (raw.startsWith('--wait-min=')) {
      const n = Number(raw.slice('--wait-min='.length))
      if (Number.isFinite(n) && n > 0) waitMin = n
    } else if (raw === '--help' || raw === '-h') {
      console.info(
        'npm run smoke:sync-queue [-- --enqueue=<jobId> --wait-min=<n>]\n' +
          `jobs: ${SYNC_QUEUE_RUNNER_JOBS.join(', ')}`,
      )
      process.exit(0)
    }
  }
  return { enqueue, waitMin }
}

function ageMin(iso: string | null): number | null {
  if (!iso) return null
  const ms = Date.parse(iso)
  return Number.isFinite(ms) ? Math.round((Date.now() - ms) / 60_000) : null
}

const failures: string[] = []
function check(ok: boolean, pass: string, fail: string): boolean {
  console.info(`${ok ? 'PASS' : 'FAIL'}  ${ok ? pass : fail}`)
  if (!ok) failures.push(fail)
  return ok
}

/** The table has to exist before anything else is worth asking. */
async function checkTable(): Promise<boolean> {
  const rows = await query<{ n: string }>(
    `SELECT count(*)::text AS n FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'sync_queue'`,
  )
  return check(
    rows[0]?.n === '1',
    'sync_queue exists',
    'sync_queue is missing — run db/migrations/0022_sync_queue.sql, or hit any page that reads the queue and let ensureSyncQueueTable() create it',
  )
}

/**
 * The check this script exists for. A runner that is up but not draining is the
 * mid-deploy state, and it is the one failure that looks like nothing is wrong:
 * Netlify stands down for a runner that will never claim, and every job stops
 * without an error anywhere.
 */
async function checkDraining(): Promise<void> {
  const [heartbeat, drain] = await Promise.all([
    getSyncMeta('last_mls_sync_heartbeat'),
    getSyncMeta(SYNC_QUEUE_DRAIN_HEARTBEAT_KEY),
  ])
  const staleMin = Math.round(SYNC_QUEUE_RUNNER_STALE_MS / 60_000)
  const drainAge = ageMin(drain)
  const beatAge = ageMin(heartbeat)

  console.info(
    `      process heartbeat ${heartbeat ? `${beatAge}m ago` : 'never'} · queue drain ${drain ? `${drainAge}m ago` : 'never'}`,
  )

  if (drain == null && heartbeat != null) {
    check(
      false,
      '',
      `mls-sync is alive (heartbeat ${beatAge}m ago) but has never drained the queue — it is still on a build that predates the queue. Deploy the runner. Netlify will rescue stranded rows meanwhile, so jobs keep running, just later.`,
    )
    return
  }
  check(
    drainAge != null && drainAge <= staleMin,
    `a runner drained the queue ${drainAge}m ago`,
    drain == null
      ? 'nothing has ever drained the queue — the runner is not deployed or cannot reach this database'
      : `nothing has drained the queue for ${drainAge}m (stale past ${staleMin}m) — Netlify is covering, but the runner needs looking at`,
  )
}

/** A job wedged at the head of the line starves everything behind it. */
async function checkBacklog(): Promise<void> {
  const snap = await readSyncQueueSnapshot(8)
  console.info(
    `      waiting ${snap.waiting.length} · running ${snap.running.length}`,
  )
  for (const item of snap.running) {
    const over =
      item.deadlineAt != null && Date.parse(item.deadlineAt) < Date.now()
    console.info(
      `      running: ${item.jobId} claimed by ${item.claimedBy ?? '?'} ${ageMin(item.claimedAt) ?? '?'}m ago${over ? ' — PAST ITS DEADLINE' : ''}`,
    )
    check(
      !over,
      `${item.jobId} is inside its budget`,
      `${item.jobId} is past its deadline and still marked running — the parent that claimed it is gone; the reaper should close it within five minutes`,
    )
  }

  const oldest = snap.waiting[0]
  const waitedMin = oldest ? (ageMin(oldest.requestedAt) ?? 0) : 0
  check(
    oldest == null || waitedMin < 60,
    oldest ? `oldest waiting row is ${waitedMin}m old` : 'nothing waiting',
    `${oldest?.jobId} has been waiting ${waitedMin}m — nothing is claiming it and no rescue has fired`,
  )

  // Only the newest failure is printed in full. Truncating these to one short
  // line hid the actionable half of a provider error — "Resend API 403: {"
  // tells you nothing, and the sentence after it names the fix.
  const newestFailure = snap.recent.find((item) => item.ok === false)
  for (const item of snap.recent.slice(0, 5)) {
    const full = item === newestFailure
    const detail = item.detail
      ? full
        ? item.detail
        : item.detail.length > 90
          ? `${item.detail.slice(0, 90)}…`
          : item.detail
      : null
    console.info(
      `      recent: ${item.jobId} → ${syncQueueOutcomeLabel(item.outcome)}${
        detail ? ` (${detail})` : ''
      }`,
    )
  }
}

/** Put a real job on the queue and watch it reach a terminal state. */
async function roundTrip(jobId: string, waitMin: number): Promise<void> {
  if (!isSyncQueueRunnerJob(jobId)) {
    check(
      false,
      '',
      `"${jobId}" is not a job the runner claims (${SYNC_QUEUE_RUNNER_JOBS.join(', ')})`,
    )
    return
  }

  const enqueued = await enqueueSyncJob({
    jobId,
    trigger: 'smoke',
    priority: SYNC_QUEUE_PRIORITY_MANUAL,
    ignoreCooldown: true,
    ...(jobId === 'market-digest' ? { payload: { force: false } } : {}),
  })
  if (!enqueued.ok || enqueued.item == null) {
    check(false, '', `could not enqueue ${jobId}: ${enqueued.reason ?? '?'}`)
    return
  }
  const id = enqueued.item.id
  console.info(
    `      queued ${jobId} as #${id}${enqueued.enqueued ? '' : ' (was already queued)'} — waiting up to ${waitMin}m`,
  )

  const deadline = Date.now() + waitMin * 60_000
  let claimed = false
  while (Date.now() < deadline) {
    const row = (
      await query<{ state: string; outcome: string | null; detail: string | null }>(
        `SELECT state, outcome, detail FROM sync_queue WHERE id = $1`,
        [id],
      )
    )[0]
    if (row == null) {
      check(false, '', `queue row #${id} vanished`)
      return
    }
    if (row.state === 'running' && !claimed) {
      claimed = true
      console.info('      claimed — a child is running it')
    }
    if (row.state === 'done' || row.state === 'failed') {
      const ok = row.outcome === 'done'
      check(
        ok,
        `${jobId} finished: ${row.detail ?? 'done'}`,
        `${jobId} ended as ${syncQueueOutcomeLabel(row.outcome as never)} — ${row.detail ?? 'no detail'}`,
      )
      return
    }
    await new Promise((r) => setTimeout(r, POLL_MS))
  }
  check(
    false,
    '',
    `${jobId} never reached a terminal state within ${waitMin}m (still ${claimed ? 'running' : 'queued'}) — raise --wait-min for a slow job, or look at whether anything claimed it`,
  )
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  assertDatabaseUrl()
  console.info(`sync queue smoke test\n      against ${describeTarget()}\n`)

  if (!(await checkTable())) {
    console.info('\nFAILED — nothing else can be checked without the table.')
    process.exit(1)
  }
  await checkDraining()
  await checkBacklog()
  if (args.enqueue) await roundTrip(args.enqueue, args.waitMin)

  if (failures.length > 0) {
    console.info(`\nFAILED (${failures.length})`)
    for (const f of failures) console.info(`  · ${f}`)
    process.exit(1)
  }
  console.info('\nPASSED')
  process.exit(0)
}

void main().catch((err) => {
  // Connection problems are the common way to get here and they have obvious
  // causes, so name them instead of printing a stack an operator has to read.
  const message = err instanceof Error ? err.message : String(err)
  const hint = /ENOTFOUND|EAI_AGAIN/i.test(message)
    ? 'The database host does not resolve — check the hostname in DATABASE_URL.'
    : /ETIMEDOUT|ECONNREFUSED|connection timeout|Connection terminated/i.test(
          message,
        )
      ? 'Could not reach the database — check the host is up and that your IP is allowed.'
      : /password|authentication|role .* does not exist/i.test(message)
        ? 'The database rejected the credentials in DATABASE_URL.'
        : null

  console.error(`\nsmoke test could not run against ${describeTarget()}`)
  console.error(`  ${message}`)
  if (hint) console.error(`  ${hint}`)
  else if (process.env.SMOKE_DEBUG) console.error(err)
  else console.error('  Re-run with SMOKE_DEBUG=1 for the stack trace.')
  process.exit(1)
})
