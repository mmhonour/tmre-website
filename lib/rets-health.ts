import 'server-only'

import { getSyncMeta, setSyncMeta } from '@/lib/listings-db'
import {
  isRetsConfigured,
  retsSyncBlockedMessage,
  withRetsClient,
} from '@/lib/rets'

export type RetsHealthStatus = 'ok' | 'missing' | 'login_failed' | 'unavailable' | 'error'

export type RetsHealthReport = {
  configured: boolean
  status: RetsHealthStatus
  ok: boolean
  message: string
  checkedAt: string | null
  detail?: string
}

const RETS_HEALTH_CHECKED_AT = 'rets_health_checked_at'
const RETS_HEALTH_STATUS = 'rets_health_status'
const RETS_HEALTH_MESSAGE = 'rets_health_message'
const RETS_HEALTH_DETAIL = 'rets_health_detail'

const PROBE_TTL_MS = 5 * 60 * 1000

export function classifyRetsError(err: unknown): {
  status: RetsHealthStatus
  message: string
  detail: string
} {
  const detail = err instanceof Error ? err.message : String(err)
  const lower = detail.toLowerCase()

  if (/rets env vars missing|credentials missing|not configured/i.test(detail)) {
    return {
      status: 'missing',
      message: retsSyncBlockedMessage(),
      detail,
    }
  }

      message:
        'Native module GLIBC mismatch — redeploy after build uses prebuild binaries (not compile-on-Noble)',
      detail,
    }
  }

  if (/NODE_MODULE_VERSION|was compiled against a different Node\.js version|ABI/i.test(detail)) {
    return {
      status: 'unavailable',
      message:
        'RETS native client ABI mismatch — redeploy after native modules rebuild for Node 22',
      detail,
    }
  }

  if (/rets client unavailable|node-expat|better-sqlite3/i.test(detail)) {
    return {
      status: 'unavailable',
      message: 'RETS native client unavailable in this runtime',
      detail,
    }
  }

  if (
    /login|log.?in|auth|unauthorized|forbidden|invalid (user|password|credential)|401|403|rejected/i.test(
      lower,
    )
  ) {
    return {
      status: 'login_failed',
      message: 'RETS login failed — check RETS_SERVER_URL, RETS_USERNAME, and RETS_PASSWORD',
      detail,
    }
  }

  return {
    status: 'error',
    message: 'RETS connection error',
    detail,
  }
}

function readCachedRetsHealth(): RetsHealthReport | null {
  const checkedAt = getSyncMeta(RETS_HEALTH_CHECKED_AT)
  const status = getSyncMeta(RETS_HEALTH_STATUS) as RetsHealthStatus | null
  const message = getSyncMeta(RETS_HEALTH_MESSAGE)
  if (!checkedAt || !status || !message) return null

  const ageMs = Date.now() - Date.parse(checkedAt)
  if (Number.isNaN(ageMs) || ageMs > PROBE_TTL_MS) return null

  return {
    configured: isRetsConfigured(),
    status,
    ok: status === 'ok',
    message,
    checkedAt,
    detail: getSyncMeta(RETS_HEALTH_DETAIL) ?? undefined,
  }
}

function persistRetsHealth(report: Omit<RetsHealthReport, 'configured'>): void {
  setSyncMeta(RETS_HEALTH_CHECKED_AT, report.checkedAt ?? new Date().toISOString())
  setSyncMeta(RETS_HEALTH_STATUS, report.status)
  setSyncMeta(RETS_HEALTH_MESSAGE, report.message)
  if (report.detail) setSyncMeta(RETS_HEALTH_DETAIL, report.detail)
}

/** Lightweight RETS login probe (limit 1 search). */
export async function probeRetsConnection(force = false): Promise<RetsHealthReport> {
  if (!isRetsConfigured()) {
    const report: RetsHealthReport = {
      configured: false,
      status: 'missing',
      ok: false,
      message: retsSyncBlockedMessage(),
      checkedAt: new Date().toISOString(),
    }
    persistRetsHealth(report)
    return report
  }

  if (!force) {
    const cached = readCachedRetsHealth()
    if (cached) return cached
  }

  const checkedAt = new Date().toISOString()

  try {
    await withRetsClient(async (client) => {
      await client.search.query('Property', 'Property', '(ModificationTimestamp=1900-01-01+)', {
        limit: 1,
        offset: 1,
      })
    })

    const report: RetsHealthReport = {
      configured: true,
      status: 'ok',
      ok: true,
      message: 'RETS login OK',
      checkedAt,
    }
    persistRetsHealth(report)
    return report
  } catch (err) {
    const classified = classifyRetsError(err)
    const report: RetsHealthReport = {
      configured: true,
      status: classified.status,
      ok: false,
      message: classified.message,
      detail: classified.detail,
      checkedAt,
    }
    persistRetsHealth(report)
    return report
  }
}

export function readStoredRetsHealth(): RetsHealthReport {
  const configured = isRetsConfigured()
  const checkedAt = getSyncMeta(RETS_HEALTH_CHECKED_AT)
  const status = (getSyncMeta(RETS_HEALTH_STATUS) as RetsHealthStatus | null) ?? (configured ? 'error' : 'missing')
  const message =
    getSyncMeta(RETS_HEALTH_MESSAGE) ??
    (configured ? 'RETS status unknown — run a sync or refresh admin' : retsSyncBlockedMessage())

  return {
    configured,
    status,
    ok: status === 'ok',
    message,
    checkedAt,
    detail: getSyncMeta(RETS_HEALTH_DETAIL) ?? undefined,
  }
}

export function recordRetsFailureFromSyncError(err: unknown): void {
  if (!isRetsConfigured()) return
  const classified = classifyRetsError(err)
  if (classified.status === 'ok') return
  persistRetsHealth({
    status: classified.status,
    ok: false,
    message: classified.message,
    detail: classified.detail,
    checkedAt: new Date().toISOString(),
  })
}
