/** Eastern clock + resume helpers for `npm run backfill:listing-photos`. */

export const LISTING_PHOTO_BACKFILL_PROGRESS_FILE =
  '.listing-photo-backfill-progress.json'

export const LISTING_PHOTO_BACKFILL_TZ = 'America/New_York'

const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const

export type ListingPhotoBackfillTownStats = {
  needed: number
  listingsDone: number
  photosStored: number
}

export type ListingPhotoBackfillCheckpoint = {
  version: 1
  key: string
  mode: string
  towns: string[]
  statuses: string[]
  limit: number
  startedAtMs: number
  updatedAtMs: number
  elapsedMs: number
  listingsDone: number
  photosStored: number
  doneIds: string[]
  townsByLabel: Record<string, ListingPhotoBackfillTownStats>
}

export function listingPhotoBackfillJobKey(input: {
  mode: string
  towns: readonly string[]
  statuses: readonly string[]
  limit?: number
}): string {
  const limit = input.limit && input.limit > 0 ? String(input.limit) : 'all'
  return `${input.mode}|${input.towns.join(',')}|${input.statuses.join(',')}|${limit}`
}

export function listingPhotoBackfillTownKey(town: string, status: string): string {
  return `${town} ${status}`
}

/** `19Sep 14:54` in America/New_York — same short stamp as agent replies. */
export function formatListingPhotoBackfillStamp(at: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: LISTING_PHOTO_BACKFILL_TZ,
    day: '2-digit',
    month: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(at)
  const day = (parts.find((p) => p.type === 'day')?.value ?? '00').padStart(2, '0')
  const monthNum = Number(parts.find((p) => p.type === 'month')?.value ?? '0')
  const month = MONTHS[monthNum - 1] ?? 'Jan'
  const hour = (parts.find((p) => p.type === 'hour')?.value ?? '00').padStart(2, '0')
  const minute = (parts.find((p) => p.type === 'minute')?.value ?? '00').padStart(
    2,
    '0',
  )
  return `${day}${month} ${hour}:${minute}`
}

export function formatListingPhotoBackfillDuration(ms: number): string {
  const totalSec = Math.max(0, Math.round(ms / 1000))
  const days = Math.floor(totalSec / 86400)
  const hours = Math.floor((totalSec % 86400) / 3600)
  const minutes = Math.floor((totalSec % 3600) / 60)
  const seconds = totalSec % 60
  if (days > 0) return hours > 0 ? `${days}d ${hours}h` : `${days}d`
  if (hours > 0) {
    return minutes > 0 ? `${hours}h ${String(minutes).padStart(2, '0')}m` : `${hours}h`
  }
  if (minutes > 0) {
    return seconds > 0 ? `${minutes}m ${String(seconds).padStart(2, '0')}s` : `${minutes}m`
  }
  return `${seconds}s`
}

/** Lifetime rate once a few listings have finished. Null until the sample is useful. */
export function estimateListingPhotoBackfillEtaMs(
  elapsedMs: number,
  done: number,
  remaining: number,
): number | null {
  if (done < 3 || elapsedMs < 30_000 || remaining <= 0) return null
  return Math.round((elapsedMs / done) * remaining)
}

export function listingPhotoBackfillCacheId(listing: {
  mlsId: string
  listingKey?: string | null
}): string {
  return listing.listingKey?.trim() || listing.mlsId.trim()
}

export function filterListingsNotYetAttempted<
  T extends { mlsId: string; listingKey?: string | null },
>(listings: readonly T[], doneIds: ReadonlySet<string>): T[] {
  return listings.filter((listing) => {
    const id = listingPhotoBackfillCacheId(listing)
    return !id || !doneIds.has(id)
  })
}

export function listingPhotoBackfillResumeCounts(input: {
  neededFromScan: number
  skippedAttempted: number
  saved?: ListingPhotoBackfillTownStats | null
}): { offset: number; total: number; photosAlreadyStored: number } {
  const listingsDone = input.saved?.listingsDone ?? 0
  const savedNeeded = input.saved?.needed ?? 0
  const total = Math.max(
    savedNeeded,
    listingsDone + input.neededFromScan,
    input.neededFromScan + input.skippedAttempted,
  )
  return {
    offset: Math.max(listingsDone, input.skippedAttempted),
    total,
    photosAlreadyStored: input.saved?.photosStored ?? 0,
  }
}

export function formatListingPhotoSyncProgressLine(input: {
  at?: Date
  label: string
  position: number
  total: number
  address: string
  stored: number
  photosStored: number
  startedAtMs: number
  priorElapsedMs: number
}): string {
  const now = input.at ?? new Date()
  const elapsedMs = input.priorElapsedMs + (now.getTime() - input.startedAtMs)
  const remaining = Math.max(0, input.total - input.position)
  const etaMs = estimateListingPhotoBackfillEtaMs(
    elapsedMs,
    input.position,
    remaining,
  )
  const etaPart =
    etaMs != null ? ` · ~${formatListingPhotoBackfillDuration(etaMs)} left` : ''
  return (
    `[listing-photos-sync] ${formatListingPhotoBackfillStamp(now)} ${input.label} ` +
    `${input.position}/${input.total} · ${formatListingPhotoBackfillDuration(elapsedMs)} elapsed` +
    `${etaPart} · ${input.address} — ${input.stored} new (${input.photosStored} total this town)`
  )
}

export function emptyListingPhotoBackfillCheckpoint(input: {
  key: string
  mode: string
  towns: string[]
  statuses: string[]
  limit: number
  nowMs: number
}): ListingPhotoBackfillCheckpoint {
  return {
    version: 1,
    key: input.key,
    mode: input.mode,
    towns: input.towns,
    statuses: input.statuses,
    limit: input.limit,
    startedAtMs: input.nowMs,
    updatedAtMs: input.nowMs,
    elapsedMs: 0,
    listingsDone: 0,
    photosStored: 0,
    doneIds: [],
    townsByLabel: {},
  }
}

export function parseListingPhotoBackfillCheckpoint(
  raw: string,
): ListingPhotoBackfillCheckpoint | null {
  try {
    const parsed = JSON.parse(raw) as Partial<ListingPhotoBackfillCheckpoint>
    if (parsed.version !== 1 || typeof parsed.key !== 'string' || !parsed.key) {
      return null
    }
    if (typeof parsed.mode !== 'string' || !Array.isArray(parsed.towns)) return null
    if (!Array.isArray(parsed.statuses) || !Array.isArray(parsed.doneIds)) return null
    if (
      typeof parsed.startedAtMs !== 'number' ||
      typeof parsed.updatedAtMs !== 'number' ||
      typeof parsed.elapsedMs !== 'number' ||
      typeof parsed.listingsDone !== 'number' ||
      typeof parsed.photosStored !== 'number'
    ) {
      return null
    }
    const limit = typeof parsed.limit === 'number' && parsed.limit > 0 ? parsed.limit : 0
    const townsByLabel: Record<string, ListingPhotoBackfillTownStats> = {}
    if (parsed.townsByLabel && typeof parsed.townsByLabel === 'object') {
      for (const [label, stats] of Object.entries(parsed.townsByLabel)) {
        if (
          !stats ||
          typeof stats.needed !== 'number' ||
          typeof stats.listingsDone !== 'number' ||
          typeof stats.photosStored !== 'number'
        ) {
          continue
        }
        townsByLabel[label] = {
          needed: stats.needed,
          listingsDone: stats.listingsDone,
          photosStored: stats.photosStored,
        }
      }
    }
    return {
      version: 1,
      key: parsed.key,
      mode: parsed.mode,
      towns: parsed.towns.filter((t): t is string => typeof t === 'string'),
      statuses: parsed.statuses.filter((s): s is string => typeof s === 'string'),
      limit,
      startedAtMs: parsed.startedAtMs,
      updatedAtMs: parsed.updatedAtMs,
      elapsedMs: parsed.elapsedMs,
      listingsDone: parsed.listingsDone,
      photosStored: parsed.photosStored,
      doneIds: parsed.doneIds.filter((id): id is string => typeof id === 'string' && id.length > 0),
      townsByLabel,
    }
  } catch {
    return null
  }
}

export function checkpointMatchesListingPhotoBackfillJob(
  checkpoint: ListingPhotoBackfillCheckpoint,
  key: string,
): boolean {
  return checkpoint.key === key
}

export type ListingPhotoBackfillProgressFile = {
  version: 1
  jobs: Record<string, ListingPhotoBackfillCheckpoint>
}

export function parseListingPhotoBackfillProgressFile(
  raw: string,
): ListingPhotoBackfillProgressFile {
  try {
    const parsed = JSON.parse(raw) as Partial<ListingPhotoBackfillProgressFile> &
      Partial<ListingPhotoBackfillCheckpoint>
    if (parsed.version === 1 && parsed.jobs && typeof parsed.jobs === 'object') {
      const jobs: Record<string, ListingPhotoBackfillCheckpoint> = {}
      for (const [key, job] of Object.entries(parsed.jobs)) {
        const checkpoint = parseListingPhotoBackfillCheckpoint(JSON.stringify(job))
        if (checkpoint) jobs[key] = checkpoint
      }
      return { version: 1, jobs }
    }
    const single = parseListingPhotoBackfillCheckpoint(raw)
    if (single) return { version: 1, jobs: { [single.key]: single } }
  } catch {
    /* fall through */
  }
  return { version: 1, jobs: {} }
}

export function upsertListingPhotoBackfillJob(
  file: ListingPhotoBackfillProgressFile,
  checkpoint: ListingPhotoBackfillCheckpoint,
): ListingPhotoBackfillProgressFile {
  return {
    version: 1,
    jobs: { ...file.jobs, [checkpoint.key]: checkpoint },
  }
}

export function removeListingPhotoBackfillJob(
  file: ListingPhotoBackfillProgressFile,
  key: string,
): ListingPhotoBackfillProgressFile {
  const jobs = { ...file.jobs }
  delete jobs[key]
  return { version: 1, jobs }
}

export function recordListingPhotoBackfillListing(
  checkpoint: ListingPhotoBackfillCheckpoint,
  input: {
    townStatus: string
    cacheId: string
    stored: number
    needed: number
    nowMs: number
    runStartedAtMs: number
    /** Elapsed from previous runs, not including this process. */
    priorElapsedMs: number
  },
): ListingPhotoBackfillCheckpoint {
  const doneIds = checkpoint.doneIds.includes(input.cacheId)
    ? checkpoint.doneIds
    : [...checkpoint.doneIds, input.cacheId]
  const prev = checkpoint.townsByLabel[input.townStatus]
  const town: ListingPhotoBackfillTownStats = {
    needed: Math.max(prev?.needed ?? 0, input.needed),
    listingsDone: (prev?.listingsDone ?? 0) + 1,
    photosStored: (prev?.photosStored ?? 0) + input.stored,
  }
  return {
    ...checkpoint,
    updatedAtMs: input.nowMs,
    elapsedMs: input.priorElapsedMs + Math.max(0, input.nowMs - input.runStartedAtMs),
    listingsDone: checkpoint.listingsDone + 1,
    photosStored: checkpoint.photosStored + input.stored,
    doneIds,
    townsByLabel: { ...checkpoint.townsByLabel, [input.townStatus]: town },
  }
}
