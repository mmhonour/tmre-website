/**
 * SmartMLS DMQL helpers shared by the RETS client and unit tests.
 *
 * Closed and Expired both throw NO_RECORDS_FOUND on `MLSStatus=|<code>` alone.
 * A StatusChangeTimestamp window without that status clause (then filter in
 * process) is the query that actually returns rows.
 */

export function omitMlsStatusWithDateWindow(status?: string): boolean {
  const key = status?.trim().toLowerCase() ?? ''
  return key === 'closed' || key === 'c' || key === 'expired' || key === 'x'
}

export type ExpiredRetsWindowParams = {
  status: 'Expired'
  limit: number
  closedAfter: string
  closedBefore?: string
}

/**
 * Always send a StatusChangeTimestamp window for Expired — same shape Closed
 * uses. Optional minAgeDays caps `closedBefore` so the page can ask for 30+.
 */
export function expiredRetsSearchParams(input: {
  limit: number
  minAgeDays?: number
  closedSince?: string
  now?: Date
}): ExpiredRetsWindowParams {
  const now = input.now ?? new Date()
  const today = now.toISOString().slice(0, 10)
  const closedAfter = (input.closedSince ?? '2019-01-01').slice(0, 10)
  const minAge = input.minAgeDays ?? 0
  const params: ExpiredRetsWindowParams = {
    status: 'Expired',
    limit: input.limit,
    closedAfter,
  }
  if (minAge > 0) {
    const d = new Date(now)
    d.setUTCDate(d.getUTCDate() - minAge)
    params.closedBefore = d.toISOString().slice(0, 10)
  } else {
    params.closedBefore = today
  }
  return params
}
