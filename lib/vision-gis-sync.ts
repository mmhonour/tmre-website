import 'server-only'

import {
  getSyncMeta,
  setSyncMeta,
  setSyncMetaDurable,
} from '@/lib/db/sync-meta-store'
import {
  backfillVisionListingLinks,
  countVisionAddresses,
  ensureVisionAddressesTable,
  getVisionFingerprint,
  listVisionPidsForTown,
  upsertVisionAddress,
} from '@/lib/db/vision-addresses-repo'
import {
  ensureVisionStreetsTable,
  listVisionStreetLetters,
  listVisionStreetsMissingParcels,
  replaceVisionStreetParcels,
  replaceVisionStreetsForLetter,
} from '@/lib/db/vision-streets-repo'
import { isR2VisionStoreConfigured, putVisionFieldCardHtml } from '@/lib/r2-vision-store'
import {
  fetchVisionFieldCardPdfJson,
  mergeFieldCardJson,
} from '@/lib/vision-field-card-pdf'
import {
  parcelLinksFromStreetHtml,
  parseVisionParcelHtml,
  streetNamesFromLetterHtml,
} from '@/lib/vision-gis-parse'
import {
  VISION_GIS_STREET_LETTERS,
  VISION_GIS_TOWNS,
  missingVisionStreetLetters,
  visionGisTownConfig,
  type VisionGisTownConfig,
} from '@/lib/vision-gis-towns'

const UA = 'tmre-bot/1.0 (+https://tmrebuilder.com; vision-addresses sync)'
const DEFAULT_DELAY_MS = 500
/** Safe Netlify / Admin chunk. CLI can raise via VISION_SYNC_MAX_PARCELS (cap 1000). */
const DEFAULT_MAX_PARCELS = 40
const ABSOLUTE_MAX_PARCELS = 1000
/** Streets.aspx?Name= pages to persist per chunk when the index has no houses yet. */
const DEFAULT_STREET_PARCEL_FILL_MAX = 250
const ABSOLUTE_STREET_PARCEL_FILL_MAX = 500
const TOWN_STATE_META_KEY = 'vision_addresses_town_state'
const SYNCED_AT_META_KEY = 'vision_addresses_synced_at'
const LAST_STATS_META_KEY = 'vision_addresses_last_stats'
/** Temporal progress while a chunk is running (Admin Status + CLI). */
const LIVE_META_KEY = 'vision_addresses_live'

export type VisionAddressesLiveProgress = {
  town: string
  phase: VisionTownPhase
  /** 1-based index within this chunk */
  n: number
  maxParcels: number
  visionPid: string
  /** Parsed Field Card address when available */
  address: string | null
  street: string | null
  letter: string | null
  /** ISO-8601 UTC */
  updatedAt: string
  status: 'running' | 'done' | 'error'
}

export function readVisionAddressesLiveProgress(): VisionAddressesLiveProgress | null {
  const raw = getSyncMeta(LIVE_META_KEY)
  if (!raw?.trim()) return null
  try {
    const parsed = JSON.parse(raw) as VisionAddressesLiveProgress
    if (!parsed || typeof parsed !== 'object') return null
    if (typeof parsed.town !== 'string' || typeof parsed.visionPid !== 'string') {
      return null
    }
    return parsed
  } catch {
    return null
  }
}

export function formatVisionAddressesLiveProgress(
  live: VisionAddressesLiveProgress | null | undefined,
): string | null {
  if (!live) return null
  if (live.status === 'done') {
    return `${live.town}: done ${live.n}/${live.maxParcels} parcels this chunk`
  }
  if (live.status === 'error') {
    return `${live.town}: error after ${live.n}/${live.maxParcels} · pid ${live.visionPid}`
  }
  const where =
    live.address?.trim() ||
    (live.street ? `${live.street}${live.letter ? ` (${live.letter})` : ''}` : null) ||
    `pid ${live.visionPid}`
  return `${live.town} ${live.phase}: ${live.n}/${live.maxParcels} · ${where}`
}

function stampLiveProgress(live: VisionAddressesLiveProgress): void {
  const payload = JSON.stringify(live)
  // In-process + Neon so Admin poll sees CLI / worker progress.
  setSyncMeta(LIVE_META_KEY, payload)
  void setSyncMetaDurable(LIVE_META_KEY, payload).catch((err) => {
    console.warn('[vision-gis-sync] live progress stamp failed', err)
  })
}

export type VisionTownPhase = 'full' | 'incremental'

/** Lifetime counters across CLI chunks (not reset when a chunk cap hits). */
export type VisionSyncSessionTotals = {
  checked: number
  newParcels: number
  changed: number
  unchanged: number
}

export type VisionTownCrawlState = {
  phase: VisionTownPhase
  /** Index into VISION_GIS_STREET_LETTERS */
  letterIndex: number
  /** Index into streets for current letter */
  streetIndex: number
  /** Offset into the current street’s parcel list — resume here after a chunk cap. */
  streetParcelOffset?: number
  /** Cached street names for current letter (full phase) */
  streetsForLetter?: string[]
  /** Last vision_pid completed in incremental PID walk */
  incrementalAfterPid?: string | null
  lastFullCompletedAt?: string | null
  lastIncrementalPassAt?: string | null
}

export type VisionAddressesSyncResult = {
  ok: boolean
  town: string
  phase: VisionTownPhase
  parcelsFetched: number
  parcelsChanged: number
  parcelsUnchanged: number
  newParcels: number
  r2Stored: number
  visionLinked: number
  listingsLinked: number
  totalRows: number
  townComplete: boolean
  durationMs: number
  syncedAt: string
  detail: string
}

type TownStateMap = Record<string, VisionTownCrawlState>

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

function readTownStateMap(): TownStateMap {
  const raw = getSyncMeta(TOWN_STATE_META_KEY)
  if (!raw) return {}
  try {
    const parsed = JSON.parse(raw) as TownStateMap
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function writeTownStateMap(map: TownStateMap): void {
  setSyncMeta(TOWN_STATE_META_KEY, JSON.stringify(map))
}

function defaultTownState(): VisionTownCrawlState {
  return {
    phase: 'full',
    letterIndex: 0,
    streetIndex: 0,
    streetParcelOffset: 0,
    streetsForLetter: undefined,
    incrementalAfterPid: null,
    lastFullCompletedAt: null,
    lastIncrementalPassAt: null,
  }
}

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { accept: 'text/html', 'user-agent': UA },
    cache: 'no-store',
  })
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`)
  return res.text()
}

/**
 * Persist the VGSI letter-page street list. Additive to the parcel walk:
 * the crawler already fetched this HTML to know which streets to visit;
 * this writes those names to `vision_streets` so Admin `/streets` can
 * list them without scraping GIS on page load. A failed letter fetch
 * must not call this.
 */
export async function recordVisionStreetIndexForLetter(
  town: string,
  letter: string,
  streetNames: readonly string[],
  sourceUrl: string,
): Promise<{ written: number; removed: number }> {
  const result = await replaceVisionStreetsForLetter(
    town,
    letter,
    streetNames,
    sourceUrl,
  )
  console.info(
    `[vision-gis-sync] street index ${town} ${letter}: ${result.written} name(s)` +
      (result.removed > 0 ? ` · replaced ${result.removed}` : ''),
  )
  return result
}

async function loadStreetsForLetter(
  cfg: VisionGisTownConfig,
  letter: string,
): Promise<string[]> {
  const url = `${cfg.baseUrl}/Streets.aspx?Letter=${encodeURIComponent(letter)}`
  const letterHtml = await fetchText(url)
  const names = streetNamesFromLetterHtml(letterHtml)
  await recordVisionStreetIndexForLetter(cfg.town, letter, names, url)
  return names
}

export type VisionStreetIndexFillResult = {
  filled: string[]
  skipped: string[]
  failed: string[]
}

/**
 * Fetch Streets.aspx?Letter= pages the parcel cursor has not visited yet.
 * Does not move letterIndex / streetsForLetter — the cadastral walk stays put.
 * A failed letter is skipped so one VGSI fault cannot block the rest.
 */
export async function fillMissingVisionStreetIndex(
  cfg: VisionGisTownConfig,
  delayMs: number,
): Promise<VisionStreetIndexFillResult> {
  const have = await listVisionStreetLetters(cfg.town)
  const missing = missingVisionStreetLetters(have)
  const skipped = VISION_GIS_STREET_LETTERS.filter(
    (letter) => !missing.includes(letter),
  )
  const filled: string[] = []
  const failed: string[] = []
  if (missing.length === 0) {
    return { filled, skipped, failed }
  }
  console.info(
    `[vision-gis-sync] street index ${cfg.town}: filling ${missing.join(',')}` +
      (skipped.length > 0 ? ` · already ${skipped.join(',')}` : ''),
  )
  for (const letter of missing) {
    try {
      await loadStreetsForLetter(cfg, letter)
      filled.push(letter)
      await sleep(delayMs)
    } catch (err) {
      failed.push(letter)
      console.warn(
        `[vision-gis-sync] street index ${cfg.town} ${letter} failed`,
        err instanceof Error ? err.message : err,
      )
    }
  }
  return { filled, skipped, failed }
}

export async function recordVisionStreetParcels(
  town: string,
  streetName: string,
  parcels: readonly { visionPid: string; addressLabel: string }[],
  sourceUrl: string,
): Promise<{ written: number; removed: number }> {
  const result = await replaceVisionStreetParcels(
    town,
    streetName,
    parcels,
    sourceUrl,
  )
  console.info(
    `[vision-gis-sync] street parcels ${town} ${streetName}: ${result.written} address(es)` +
      (result.removed > 0 ? ` · replaced ${result.removed}` : ''),
  )
  return result
}

export type VisionStreetParcelFillResult = {
  filled: number
  addresses: number
  failed: number
}

/**
 * Fetch Streets.aspx?Name= for official streets that have no house list yet.
 * Does not ingest Field Cards and does not move the parcel cursor.
 */
export async function fillMissingVisionStreetParcels(
  cfg: VisionGisTownConfig,
  delayMs: number,
  maxStreets = DEFAULT_STREET_PARCEL_FILL_MAX,
): Promise<VisionStreetParcelFillResult> {
  const cap = Math.max(
    1,
    Math.min(maxStreets, ABSOLUTE_STREET_PARCEL_FILL_MAX),
  )
  const missing = await listVisionStreetsMissingParcels(cfg.town, cap)
  const result: VisionStreetParcelFillResult = {
    filled: 0,
    addresses: 0,
    failed: 0,
  }
  if (missing.length === 0) return result
  console.info(
    `[vision-gis-sync] street parcels ${cfg.town}: filling ${missing.length} street page(s)`,
  )
  for (const street of missing) {
    const url = `${cfg.baseUrl}/Streets.aspx?Name=${encodeURIComponent(street)}`
    try {
      const html = await fetchText(url)
      const links = parcelLinksFromStreetHtml(html)
      const written = await recordVisionStreetParcels(
        cfg.town,
        street,
        links,
        url,
      )
      result.filled += 1
      result.addresses += written.written
      await sleep(delayMs)
    } catch (err) {
      result.failed += 1
      console.warn(
        `[vision-gis-sync] street parcels ${cfg.town} ${street} failed`,
        err instanceof Error ? err.message : err,
      )
    }
  }
  return result
}

function formatStreetParcelFill(
  fill: VisionStreetParcelFillResult,
): string | null {
  if (fill.filled === 0 && fill.failed === 0) return null
  const parts = [
    fill.filled > 0
      ? `street parcels +${fill.filled} (${fill.addresses} addr)`
      : null,
    fill.failed > 0 ? `street parcels fail ${fill.failed}` : null,
  ]
  return parts.filter(Boolean).join(' · ')
}

function formatStreetIndexFill(fill: VisionStreetIndexFillResult): string | null {
  if (fill.filled.length === 0 && fill.failed.length === 0) return null
  const parts = [
    fill.filled.length > 0
      ? `street index +${fill.filled.join('')}`
      : null,
    fill.failed.length > 0
      ? `street index fail ${fill.failed.join('')}`
      : null,
  ]
  return parts.filter(Boolean).join(' · ')
}

async function ingestParcel(
  cfg: VisionGisTownConfig,
  visionPid: string,
  delayMs: number,
  counts: {
    fetched: number
    changed: number
    unchanged: number
    neu: number
    r2: number
  },
  ctx: {
    phase: VisionTownPhase
    maxParcels: number
    street: string | null
    letter: string | null
    session?: VisionSyncSessionTotals
  },
): Promise<void> {
  const html = await fetchText(`${cfg.baseUrl}/Parcel.aspx?pid=${visionPid}`)
  const parsed = parseVisionParcelHtml(html, {
    town: cfg.town,
    visionPid,
    baseUrl: cfg.baseUrl,
    sourceHost: `gis.vgsi.com/${cfg.hostSlug}`,
  })
  const pdfCard = await fetchVisionFieldCardPdfJson(cfg.town, visionPid)
  if (pdfCard) {
    parsed.fieldCard = mergeFieldCardJson(parsed.fieldCard, pdfCard)
  }
  const prev = await getVisionFingerprint(cfg.town, visionPid)
  const isNew = prev == null
  const changed = isNew || prev !== parsed.contentFingerprint
  counts.fetched += 1
  if (isNew) counts.neu += 1
  if (changed) counts.changed += 1
  else counts.unchanged += 1

  const address =
    parsed.addressFull?.trim() ||
    [parsed.streetNo, parsed.streetName].filter(Boolean).join(' ').trim() ||
    null
  const n = counts.fetched
  if (ctx.session) {
    ctx.session.checked += 1
    if (isNew) ctx.session.newParcels += 1
    if (changed) ctx.session.changed += 1
    else ctx.session.unchanged += 1
  }
  // scraped_at is always ISO-8601 UTC (…Z / Postgres timestamptz +00).
  const scrapedAt = new Date().toISOString()
  stampLiveProgress({
    town: cfg.town,
    phase: ctx.phase,
    n,
    maxParcels: ctx.maxParcels,
    visionPid,
    address,
    street: ctx.street,
    letter: ctx.letter,
    updatedAt: scrapedAt,
    status: 'running',
  })
  const checked = ctx.session?.checked ?? n
  console.info(
    `[vision-gis-sync] checked ${checked}` +
      ` · chunk ${n}/${ctx.maxParcels} pid=${visionPid}` +
      (address ? ` · ${address}` : '') +
      (ctx.street && !address ? ` · ${ctx.street}` : '') +
      ` · ${cfg.town} ${ctx.phase}` +
      (isNew ? ' · new' : changed ? ' · changed' : ' · unchanged'),
  )

  let r2Key: string | null = null
  let rewriteBlob = false
  if (changed && isR2VisionStoreConfigured()) {
    r2Key = await putVisionFieldCardHtml(cfg.town, visionPid, html)
    if (r2Key) {
      rewriteBlob = true
      counts.r2 += 1
    }
  }

  await upsertVisionAddress(parsed, {
    scrapedAt,
    fieldCardR2Key: r2Key,
    rewriteBlob,
    changed,
  })
  await sleep(delayMs)
}

export async function listVisionParcelsOnStreet(
  town: string,
  streetName: string,
): Promise<{ visionPid: string; addressLabel: string }[]> {
  const cfg = visionGisTownConfig(town)
  if (!cfg) return []
  const html = await fetchText(
    `${cfg.baseUrl}/Streets.aspx?Name=${encodeURIComponent(streetName)}`,
  )
  return parcelLinksFromStreetHtml(html)
}

/** Ingest one VGSI PID into vision_addresses (Field Card JSON + optional R2). */
export async function ingestVisionParcelPid(
  town: string,
  visionPid: string,
  options?: { delayMs?: number; session?: VisionSyncSessionTotals },
): Promise<{ isNew: boolean; changed: boolean; address: string | null }> {
  const cfg = visionGisTownConfig(town)
  if (!cfg) throw new Error(`No VGSI host for town "${town}"`)
  const counts = { fetched: 0, changed: 0, unchanged: 0, neu: 0, r2: 0 }
  await ingestParcel(cfg, visionPid, options?.delayMs ?? DEFAULT_DELAY_MS, counts, {
    phase: 'incremental',
    maxParcels: 1,
    street: null,
    letter: null,
    session: options?.session,
  })
  return {
    isNew: counts.neu > 0,
    changed: counts.changed > 0,
    address: null,
  }
}

/** Walk letter → street → parcels. Resume mid-street so a chunk cap cannot skip tails. */
async function sweepStreets(
  cfg: VisionGisTownConfig,
  state: VisionTownCrawlState,
  delayMs: number,
  maxParcels: number,
  counts: {
    fetched: number
    changed: number
    unchanged: number
    neu: number
    r2: number
  },
  session?: VisionSyncSessionTotals,
): Promise<void> {
  while (
    counts.fetched < maxParcels &&
    state.letterIndex < VISION_GIS_STREET_LETTERS.length
  ) {
    const letter = VISION_GIS_STREET_LETTERS[state.letterIndex]!
    if (!state.streetsForLetter) {
      console.info(`[vision-gis-sync] letter ${letter} · loading streets…`)
      state.streetsForLetter = await loadStreetsForLetter(cfg, letter)
      state.streetIndex = 0
      state.streetParcelOffset = 0
      console.info(
        `[vision-gis-sync] letter ${letter} · ${state.streetsForLetter.length} streets`,
      )
      await sleep(delayMs)
    }

    const streets = state.streetsForLetter
    if (state.streetIndex >= streets.length) {
      state.letterIndex += 1
      state.streetIndex = 0
      state.streetParcelOffset = 0
      state.streetsForLetter = undefined
      continue
    }

    const street = streets[state.streetIndex]!
    const offset = state.streetParcelOffset ?? 0
    console.info(
      `[vision-gis-sync] street ${street} (${letter})` +
        (offset > 0 ? ` · resume @${offset}` : '') +
        ` · fetching parcels…`,
    )
    const streetUrl = `${cfg.baseUrl}/Streets.aspx?Name=${encodeURIComponent(street)}`
    const streetHtml = await fetchText(streetUrl)
    const links = parcelLinksFromStreetHtml(streetHtml)
    try {
      await recordVisionStreetParcels(cfg.town, street, links, streetUrl)
    } catch (err) {
      console.warn(
        `[vision-gis-sync] street parcels ${cfg.town} ${street} write failed`,
        err instanceof Error ? err.message : err,
      )
    }
    await sleep(delayMs)

    let i = offset
    for (; i < links.length; i++) {
      if (counts.fetched >= maxParcels) break
      await ingestParcel(cfg, links[i]!.visionPid, delayMs, counts, {
        phase: state.phase,
        maxParcels,
        street,
        letter,
        session,
      })
    }

    if (i < links.length) {
      state.streetParcelOffset = i
      return
    }
    state.streetIndex += 1
    state.streetParcelOffset = 0
  }
}

export type SyncVisionAddressesOptions = {
  town?: string
  maxParcels?: number
  delayMs?: number
  /** Force restart full fill for the town */
  forceFull?: boolean
  skipListingBackfill?: boolean
  /** CLI running totals — incremented for every parcel checked, across chunks. */
  sessionTotals?: VisionSyncSessionTotals
}

export async function syncVisionAddresses(
  options: SyncVisionAddressesOptions = {},
): Promise<VisionAddressesSyncResult> {
  const started = Date.now()
  const syncedAt = new Date().toISOString()
  const townName = options.town?.trim() || VISION_GIS_TOWNS[0]!.town
  const cfg = visionGisTownConfig(townName)
  if (!cfg) {
    return {
      ok: false,
      town: townName,
      phase: 'full',
      parcelsFetched: 0,
      parcelsChanged: 0,
      parcelsUnchanged: 0,
      newParcels: 0,
      r2Stored: 0,
      visionLinked: 0,
      listingsLinked: 0,
      totalRows: 0,
      townComplete: false,
      durationMs: Date.now() - started,
      syncedAt,
      detail: `No VGSI host configured for town "${townName}"`,
    }
  }

  const maxParcels = Math.max(
    1,
    Math.min(options.maxParcels ?? DEFAULT_MAX_PARCELS, ABSOLUTE_MAX_PARCELS),
  )
  const delayMs = Math.max(200, options.delayMs ?? DEFAULT_DELAY_MS)

  await ensureVisionAddressesTable()
  await ensureVisionStreetsTable()

  const stateMap = readTownStateMap()
  let state = stateMap[cfg.town] ?? defaultTownState()
  if (options.forceFull) {
    state = defaultTownState()
  }

  const counts = {
    fetched: 0,
    changed: 0,
    unchanged: 0,
    neu: 0,
    r2: 0,
  }
  let townComplete = false
  console.info(
    `[vision-gis-sync] start town=${cfg.town} phase=${state.phase} maxParcels=${maxParcels} delayMs=${delayMs}` +
      ` (scraped_at timestamps are UTC)`,
  )
  stampLiveProgress({
    town: cfg.town,
    phase: state.phase,
    n: 0,
    maxParcels,
    visionPid: '',
    address: null,
    street: null,
    letter: null,
    updatedAt: syncedAt,
    status: 'running',
  })

  let streetIndexFill: VisionStreetIndexFillResult = {
    filled: [],
    skipped: [],
    failed: [],
  }
  let streetParcelFill: VisionStreetParcelFillResult = {
    filled: 0,
    addresses: 0,
    failed: 0,
  }
  try {
    streetIndexFill = await fillMissingVisionStreetIndex(cfg, delayMs)
  } catch (err) {
    console.warn('[vision-gis-sync] street index fill failed', err)
  }
  try {
    streetParcelFill = await fillMissingVisionStreetParcels(cfg, delayMs)
  } catch (err) {
    console.warn('[vision-gis-sync] street parcel fill failed', err)
  }

  try {
    if (state.phase === 'full') {
      await sweepStreets(
        cfg,
        state,
        delayMs,
        maxParcels,
        counts,
        options.sessionTotals,
      )

      if (state.letterIndex >= VISION_GIS_STREET_LETTERS.length) {
        state.phase = 'incremental'
        state.lastFullCompletedAt = syncedAt
        state.incrementalAfterPid = null
        state.streetsForLetter = undefined
        state.letterIndex = 0
        state.streetIndex = 0
        state.streetParcelOffset = 0
        townComplete = true
      }
    } else {
      // Refresh known PIDs, then street-sweep remaining budget so missed
      // tails (e.g. mid-street chunk skip) still get ingested.
      const pids = await listVisionPidsForTown(
        cfg.town,
        state.incrementalAfterPid ?? null,
        maxParcels,
      )
      if (pids.length === 0) {
        state.incrementalAfterPid = null
        state.lastIncrementalPassAt = syncedAt
      } else {
        for (const pid of pids) {
          if (counts.fetched >= maxParcels) break
          await ingestParcel(cfg, pid, delayMs, counts, {
            phase: state.phase,
            maxParcels,
            street: null,
            letter: null,
            session: options.sessionTotals,
          })
          state.incrementalAfterPid = pid
        }
      }
      if (counts.fetched < maxParcels) {
        if (state.letterIndex >= VISION_GIS_STREET_LETTERS.length) {
          state.letterIndex = 0
          state.streetIndex = 0
          state.streetParcelOffset = 0
          state.streetsForLetter = undefined
        }
        await sweepStreets(
          cfg,
          state,
          delayMs,
          maxParcels,
          counts,
          options.sessionTotals,
        )
        if (state.letterIndex >= VISION_GIS_STREET_LETTERS.length) {
          state.letterIndex = 0
          state.streetIndex = 0
          state.streetParcelOffset = 0
          state.streetsForLetter = undefined
        }
      }
    }
  } catch (err) {
    console.error('[vision-gis-sync]', err)
    stateMap[cfg.town] = state
    writeTownStateMap(stateMap)
    const totalRows = await countVisionAddresses(cfg.town)
    const detail = [
      err instanceof Error ? err.message : String(err),
      formatStreetIndexFill(streetIndexFill),
      formatStreetParcelFill(streetParcelFill),
    ]
      .filter(Boolean)
      .join(' · ')
    stampLiveProgress({
      town: cfg.town,
      phase: state.phase,
      n: counts.fetched,
      maxParcels,
      visionPid: '',
      address: null,
      street: null,
      letter: null,
      updatedAt: new Date().toISOString(),
      status: 'error',
    })
    const result: VisionAddressesSyncResult = {
      ok: false,
      town: cfg.town,
      phase: state.phase,
      parcelsFetched: counts.fetched,
      parcelsChanged: counts.changed,
      parcelsUnchanged: counts.unchanged,
      newParcels: counts.neu,
      r2Stored: counts.r2,
      visionLinked: 0,
      listingsLinked: 0,
      totalRows,
      townComplete: false,
      durationMs: Date.now() - started,
      syncedAt,
      detail,
    }
    setSyncMeta(SYNCED_AT_META_KEY, syncedAt)
    setSyncMeta(LAST_STATS_META_KEY, JSON.stringify(result))
    return result
  }

  stateMap[cfg.town] = state
  writeTownStateMap(stateMap)

  let visionLinked = 0
  let listingsLinked = 0
  if (!options.skipListingBackfill) {
    try {
      const linked = await backfillVisionListingLinks(cfg.town)
      visionLinked = linked.visionLinked
      listingsLinked = linked.listingsLinked
    } catch (err) {
      console.warn('[vision-gis-sync] listing backfill failed', err)
    }
  }

  const totalRows = await countVisionAddresses(cfg.town)
  const detail = [
    `${cfg.town} phase=${state.phase}`,
    `fetched ${counts.fetched}`,
    `changed ${counts.changed}`,
    `new ${counts.neu}`,
    `r2 ${counts.r2}`,
    formatStreetIndexFill(streetIndexFill),
    formatStreetParcelFill(streetParcelFill),
    townComplete ? 'full fill complete → incremental' : null,
    `linked vision=${visionLinked} listings=${listingsLinked}`,
  ]
    .filter(Boolean)
    .join(' · ')

  const result: VisionAddressesSyncResult = {
    ok: true,
    town: cfg.town,
    phase: state.phase,
    parcelsFetched: counts.fetched,
    parcelsChanged: counts.changed,
    parcelsUnchanged: counts.unchanged,
    newParcels: counts.neu,
    r2Stored: counts.r2,
    visionLinked,
    listingsLinked,
    totalRows,
    townComplete,
    durationMs: Date.now() - started,
    syncedAt,
    detail,
  }

  setSyncMeta(SYNCED_AT_META_KEY, syncedAt)
  setSyncMeta(LAST_STATS_META_KEY, JSON.stringify(result))
  stampLiveProgress({
    town: cfg.town,
    phase: state.phase,
    n: counts.fetched,
    maxParcels,
    visionPid: '',
    address: null,
    street: null,
    letter: null,
    updatedAt: new Date().toISOString(),
    status: 'done',
  })
  console.info(`[vision-gis-sync] ${detail} · ${result.durationMs}ms`)
  return result
}
