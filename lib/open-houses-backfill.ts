import {
  OPEN_HOUSE_LOOKBACK_DAYS,
  addCalendarDays,
  etCalendarDate,
  openHouseLookbackWindow,
} from '@/lib/open-houses'

export const OPEN_HOUSE_BACKFILL_CHUNK_DAYS = 14

export type BackfillOpenHouseCliArgs = {
  days: number
  chunkDays: number
  maxMinutes: number | null
  oldestFirst: boolean
}

function parsePositiveInt(raw: string, label: string): number {
  const n = Number(raw)
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 1) {
    throw new Error(`${label} must be a positive integer (got ${raw})`)
  }
  return n
}

/** CLI flags for `scripts/backfill-open-houses.ts` / the PowerShell wrapper. */
export function parseBackfillOpenHouseArgs(
  argv: readonly string[],
): BackfillOpenHouseCliArgs {
  let days = OPEN_HOUSE_LOOKBACK_DAYS
  let chunkDays = OPEN_HOUSE_BACKFILL_CHUNK_DAYS
  let maxMinutes: number | null = null
  let oldestFirst = false

  for (const arg of argv) {
    if (arg === '--oldest-first') {
      oldestFirst = true
      continue
    }
    if (arg.startsWith('--days=')) {
      days = parsePositiveInt(arg.slice('--days='.length), '--days')
      continue
    }
    if (arg.startsWith('--chunk-days=')) {
      chunkDays = parsePositiveInt(arg.slice('--chunk-days='.length), '--chunk-days')
      continue
    }
    if (arg.startsWith('--max-minutes=')) {
      maxMinutes = parsePositiveInt(
        arg.slice('--max-minutes='.length),
        '--max-minutes',
      )
      continue
    }
    throw new Error(`Unknown argument: ${arg}`)
  }

  return { days, chunkDays, maxMinutes, oldestFirst }
}

/** Yesterday back through `days` (same shape as the hourly prune horizon). */
export function lookbackWindowForDays(
  days: number,
  from = new Date(),
): { start: string; end: string } {
  if (days === OPEN_HOUSE_LOOKBACK_DAYS) return openHouseLookbackWindow(from)
  const today = etCalendarDate(from)
  return {
    start: addCalendarDays(today, -days),
    end: addCalendarDays(today, -1),
  }
}
