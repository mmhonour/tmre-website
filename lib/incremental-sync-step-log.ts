import 'server-only'

import {
  getSyncMeta,
  setSyncMetaDurable,
} from '@/lib/db/sync-meta-store'

/** Latest incremental run step transcript (JSON in sync_meta). */
export const INCREMENTAL_STEP_LOG_KEY = 'last_incremental_step_log'

export type IncrementalStepLogEntry = {
  at: string
  step: string
  detail?: string
}

export type IncrementalStepLog = {
  runId: string
  source: string
  startedAt: string
  finishedAt: string | null
  steps: IncrementalStepLogEntry[]
  summary?: string
}

type ActiveLog = {
  log: IncrementalStepLog
  dirty: boolean
  lastFlushMs: number
}

let active: ActiveLog | null = null

const FLUSH_EVERY_MS = 2_000

function nowIso(): string {
  return new Date().toISOString()
}

function newRunId(): string {
  return `inc-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

async function flushActive(force = false): Promise<void> {
  if (!active?.dirty) return
  const age = Date.now() - active.lastFlushMs
  if (!force && age < FLUSH_EVERY_MS) return
  await setSyncMetaDurable(INCREMENTAL_STEP_LOG_KEY, JSON.stringify(active.log))
  active.dirty = false
  active.lastFlushMs = Date.now()
}

/** Start a new run transcript (replaces the previous one in sync_meta). */
export async function beginIncrementalStepLog(source: string): Promise<string> {
  const startedAt = nowIso()
  const runId = newRunId()
  active = {
    log: {
      runId,
      source,
      startedAt,
      finishedAt: null,
      steps: [{ at: startedAt, step: 'begin', detail: `source=${source}` }],
    },
    dirty: true,
    lastFlushMs: 0,
  }
  await flushActive(true)
  return runId
}

/**
 * Continue an unfinished log from sync_meta (e.g. cron queued → worker hop),
 * otherwise start a fresh run. Lets a stuck Queued leave a trail until the
 * worker actually starts.
 */
export async function continueOrBeginIncrementalStepLog(
  source: string,
): Promise<string> {
  if (!active) {
    const existing = readIncrementalStepLog()
    if (existing && !existing.finishedAt) {
      active = {
        log: {
          ...existing,
          source: existing.source.includes(source)
            ? existing.source
            : `${existing.source}→${source}`,
        },
        dirty: true,
        lastFlushMs: 0,
      }
      await appendIncrementalStep('worker-continue', `source=${source}`)
      return existing.runId
    }
  } else if (!active.log.finishedAt) {
    await appendIncrementalStep('worker-continue', `source=${source}`)
    return active.log.runId
  }
  return beginIncrementalStepLog(source)
}

/** Queue-time breadcrumb — replaced/continued when the worker starts. */
export async function stampIncrementalQueuedStepLog(
  source: string,
  detail?: string,
): Promise<void> {
  await beginIncrementalStepLog(source)
  await appendIncrementalStep('queued', detail)
}

/** Append a step; flushes to Postgres every ~2s so a crashed run still leaves a trail. */
export async function appendIncrementalStep(
  step: string,
  detail?: string,
): Promise<void> {
  if (!active) {
    // Orphan append (e.g. CLI without begin) — start a scratch run.
    await beginIncrementalStepLog('unknown')
  }
  if (!active) return
  active.log.steps.push({
    at: nowIso(),
    step,
    detail: detail?.trim() || undefined,
  })
  active.dirty = true
  await flushActive(false)
}

export async function finishIncrementalStepLog(
  summary: string,
): Promise<IncrementalStepLog | null> {
  if (!active) return readIncrementalStepLog()
  active.log.finishedAt = nowIso()
  active.log.summary = summary
  active.log.steps.push({
    at: active.log.finishedAt,
    step: 'finish',
    detail: summary,
  })
  active.dirty = true
  await flushActive(true)
  const done = active.log
  active = null
  return done
}

export function readIncrementalStepLog(): IncrementalStepLog | null {
  const raw = getSyncMeta(INCREMENTAL_STEP_LOG_KEY)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as IncrementalStepLog
    if (
      !parsed ||
      typeof parsed !== 'object' ||
      typeof parsed.runId !== 'string' ||
      !Array.isArray(parsed.steps)
    ) {
      return null
    }
    return parsed
  } catch {
    return null
  }
}

/** Pretty text dump for CLI / file inspection. */
export function formatIncrementalStepLog(
  log: IncrementalStepLog | null,
): string {
  if (!log) return '(no incremental step log yet)\n'
  const lines: string[] = [
    `runId: ${log.runId}`,
    `source: ${log.source}`,
    `startedAt: ${log.startedAt}`,
    `finishedAt: ${log.finishedAt ?? '(in progress / crashed)'}`,
    `summary: ${log.summary ?? '(none)'}`,
    `steps (${log.steps.length}):`,
  ]
  for (const entry of log.steps) {
    const detail = entry.detail ? ` — ${entry.detail}` : ''
    lines.push(`  ${entry.at}  ${entry.step}${detail}`)
  }
  return `${lines.join('\n')}\n`
}
