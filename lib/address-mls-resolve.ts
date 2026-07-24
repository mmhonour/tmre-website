import 'server-only'

import { streetsMatch } from '@/lib/listing-history'
import { searchListingsInDbByQuery } from '@/lib/db/listings-repo'
import { persistListingRecord } from '@/lib/listings-store'
import {
  findPropertyAddressByNorm,
  searchPropertyAddressesInDb,
  upsertPropertyAddress,
} from '@/lib/property-address-db'
import {
  formatPropertyAddressFull,
  listingToPropertyAddressDraft,
  normalizePropertyAddress,
  normalizeStreetLine,
} from '@/lib/property-address'
import { searchListings, type Listing } from '@/lib/rets'
import { isTmreTown, resolveListingTown } from '@/lib/tmre-towns'

export type AddressLookupInput = {
  street: string
  city: string
  state?: string
  postalCode?: string
}

export type AddressMlsResolveSource =
  | 'directory'
  | 'db'
  | 'rets'
  | 'none'

export type AddressMlsResolveResult = {
  mlsId: string | null
  listingKey: string | null
  listing: Listing | null
  source: AddressMlsResolveSource
  address: AddressLookupInput
}

export type ResolveMlsIdByAddressOptions = {
  /** Allow SmartMLS lookup when SQLite has no match (default true). */
  allowRets?: boolean
  /** Persist listing row + property-address directory entry (default true). */
  persist?: boolean
  statusBuckets?: string[]
}

function normalizeCity(city: string): string {
  return city
    .trim()
    .replace(/\b(CT|Connecticut)\b/gi, '')
    .replace(/\d{5}(-\d{4})?/g, '')
    .trim()
}

/** Parse a human address line like `87 Kings Hwy S, Westport, CT 06880`. */
export function parseHumanAddressInput(
  raw: string,
  options: { cityHint?: string } = {},
): AddressLookupInput | null {
  const trimmed = raw.trim()
  if (trimmed.length < 2) return null

  const cityHint = options.cityHint?.trim()
  const parts = trimmed.split(',').map((part) => part.trim()).filter(Boolean)

  if (parts.length >= 2) {
    const street = parts[0]
    let city = cityHint ? normalizeCity(cityHint) : ''
    let postalCode: string | undefined

    const tail = parts[parts.length - 1]
    const zipMatch = tail.match(/\b(\d{5})\b/)
    if (zipMatch) postalCode = zipMatch[1]

    if (!city) {
      const cityPart = parts.length >= 3 ? parts[parts.length - 2] : parts[1]
      city = normalizeCity(cityPart)
    }

    if (city && isTmreTown(city)) {
      return { street, city, state: 'CT', postalCode }
    }
  }

  if (cityHint && isTmreTown(normalizeCity(cityHint))) {
    return {
      street: trimmed,
      city: normalizeCity(cityHint),
      state: 'CT',
    }
  }

  return null
}

function listingMatchesAddress(listing: Listing, input: AddressLookupInput): boolean {
  const listingStreet = listing.address.street || listing.address.full || ''
  if (!streetsMatch(input.street, listingStreet)) return false
  const targetCity = input.city.trim().toLowerCase()
  const listingCity = listing.address.city?.trim().toLowerCase() ?? ''
  if (targetCity && listingCity && listingCity !== targetCity) return false
  return true
}

function listingLooksOffMarket(listing: Listing | null | undefined): boolean {
  if (!listing) return true
  const s = (listing.status ?? '').toLowerCase()
  return (
    s.includes('closed') ||
    s.includes('expired') ||
    s.includes('withdrawn') ||
    s.includes('cancelled') ||
    s.includes('canceled')
  )
}

/** Prefer current market rows (Active / CS / UC / Pending), then newest mod time. */
function listingCurrentRank(listing: Listing): number {
  if (listingLooksOffMarket(listing)) return 100
  const s = (listing.status ?? '').toLowerCase()
  if (s.includes('under contract') || s.includes('pending')) return 0
  if (s.includes('active')) return 1
  if (s.includes('coming soon')) return 2
  return 3
}

function listingModTs(listing: Listing): number {
  const raw = listing.modificationTimestamp?.trim()
  if (!raw) return 0
  const t = Date.parse(raw)
  return Number.isNaN(t) ? 0 : t
}

function pickBestListingMatch(
  listings: Listing[],
  input: AddressLookupInput,
): Listing | null {
  const matches = listings.filter((listing) => listingMatchesAddress(listing, input))
  if (matches.length === 0) return null

  const inputNorm = normalizeStreetLine(input.street)
  const exact = matches.filter((listing) => {
    const street = listing.address.street || listing.address.full || ''
    return normalizeStreetLine(street) === inputNorm
  })
  const pool = exact.length > 0 ? exact : matches

  pool.sort((a, b) => {
    const rank = listingCurrentRank(a) - listingCurrentRank(b)
    if (rank !== 0) return rank
    return listingModTs(b) - listingModTs(a)
  })
  return pool[0] ?? null
}

function resultFromListing(
  listing: Listing,
  input: AddressLookupInput,
  source: AddressMlsResolveSource,
): AddressMlsResolveResult {
  return {
    mlsId: listing.mlsId?.trim() || null,
    listingKey: listing.listingKey?.trim() || null,
    listing,
    source,
    address: input,
  }
}

async function persistAddressResolution(listing: Listing, input: AddressLookupInput): Promise<void> {
  await persistListingRecord(listing)
  const town = resolveListingTown(listing.address.city) ?? input.city
  if (!isTmreTown(town)) return

  const draft = listingToPropertyAddressDraft(
    listing,
    town,
    listing.listingKey?.trim() || listing.mlsId,
  )
  await upsertPropertyAddress(draft, new Date().toISOString())
}

async function lookupDirectoryMlsId(input: AddressLookupInput): Promise<string | null> {
  const addressNorm = normalizePropertyAddress(input.city, input.street, input.postalCode)
  const exact = await findPropertyAddressByNorm(input.city, addressNorm)
  if (exact?.mlsId?.trim()) return exact.mlsId.trim()

  const hits = await searchPropertyAddressesInDb(input.street, {
    limit: 12,
    town: input.city,
  })
  for (const row of hits) {
    if (!row.mlsId?.trim()) continue
    if (streetsMatch(input.street, row.street)) return row.mlsId.trim()
  }
  return null
}

/**
 * Resolve a TMRE town address to an MLS id.
 * Order: property-address directory → listings DB → SmartMLS (optional).
 * Successful matches are persisted for future lookups.
 * Directory hits that point at Closed/Expired rows are skipped so Spotlight
 * can find the live listing (Active / Coming Soon / Under Contract) at the
 * same address. Current directory rows are candidates only — street search
 * may prefer a newer Under Contract rental over a stale Coming Soon sale id.
 */
export async function resolveMlsIdByAddress(
  input: AddressLookupInput,
  options: ResolveMlsIdByAddressOptions = {},
): Promise<AddressMlsResolveResult> {
  const allowRets = options.allowRets !== false
  const persist = options.persist !== false
  const street = input.street.trim()
  const city = input.city.trim()

  if (!street || street.length < 2 || !city || !isTmreTown(city)) {
    return {
      mlsId: null,
      listingKey: null,
      listing: null,
      source: 'none',
      address: input,
    }
  }

  const normalized: AddressLookupInput = {
    street,
    city,
    state: input.state?.trim() || 'CT',
    postalCode: input.postalCode?.trim(),
  }

  const statusBuckets = options.statusBuckets ?? ['Active', 'Closed', 'Expired']

  const candidates: Listing[] = []

  const directoryMlsId = await lookupDirectoryMlsId(normalized)
  if (directoryMlsId) {
    const dirHits = await searchListingsInDbByQuery(directoryMlsId, {
      limit: 1,
      statusBuckets,
    })
    const dirListing = dirHits[0] ?? null
    // Keep current directory rows as candidates only — a stale Coming Soon /
    // Active sale id must not block a newer Under Contract rental at the address.
    if (dirListing && !listingLooksOffMarket(dirListing)) {
      candidates.push(dirListing)
    }
  }

  const dbHits = await searchListingsInDbByQuery(street, {
    limit: 24,
    statusBuckets,
  })
  for (const hit of dbHits) {
    if (!listingLooksOffMarket(hit)) candidates.push(hit)
  }

  const dbMatch = pickBestListingMatch(
    candidates.length > 0 ? candidates : dbHits,
    normalized,
  )

  if (!allowRets) {
    if (dbMatch?.mlsId?.trim()) {
      if (persist) await persistAddressResolution(dbMatch, normalized)
      return resultFromListing(dbMatch, normalized, 'db')
    }
    return {
      mlsId: null,
      listingKey: null,
      listing: null,
      source: 'none',
      address: normalized,
    }
  }

  // Always consult RETS when enabled — Postgres Active sync historically omitted
  // Under Contract, so a stale Coming Soon sale in DB must not hide a live UC
  // rental that RETS still returns for this address.
  try {
    const retsHits = await searchListings({
      county: 'fairfield',
      addressContains: street,
      city,
      limit: 24,
    })
    const pool = [
      ...(dbMatch ? [dbMatch] : []),
      ...candidates,
      ...retsHits,
    ]
    const best = pickBestListingMatch(pool, normalized)
    if (best?.mlsId?.trim()) {
      if (persist) await persistAddressResolution(best, normalized)
      const fromRets = retsHits.some(
        (l) => (l.mlsId?.trim() || '') === (best.mlsId?.trim() || ''),
      )
      return resultFromListing(best, normalized, fromRets ? 'rets' : 'db')
    }
  } catch (err) {
    console.warn('[address-mls-resolve] RETS lookup failed', err)
    if (dbMatch?.mlsId?.trim()) {
      if (persist) await persistAddressResolution(dbMatch, normalized)
      return resultFromListing(dbMatch, normalized, 'db')
    }
  }

  // Last resort: directory Closed id if nothing on-market was found.
  if (directoryMlsId) {
    const closedHits = await searchListingsInDbByQuery(directoryMlsId, {
      limit: 1,
      statusBuckets,
    })
    return {
      mlsId: directoryMlsId,
      listingKey: closedHits[0]?.listingKey?.trim() || null,
      listing: closedHits[0] ?? null,
      source: 'directory',
      address: normalized,
    }
  }

  return {
    mlsId: null,
    listingKey: null,
    listing: null,
    source: 'none',
    address: normalized,
  }
}

/** Convenience wrapper — accepts a single human address string. */
export async function resolveMlsIdFromHumanAddress(
  raw: string,
  options: ResolveMlsIdByAddressOptions & { cityHint?: string } = {},
): Promise<AddressMlsResolveResult> {
  const parsed = parseHumanAddressInput(raw, { cityHint: options.cityHint })
  if (!parsed) {
    return {
      mlsId: null,
      listingKey: null,
      listing: null,
      source: 'none',
      address: { street: raw.trim(), city: options.cityHint?.trim() ?? '' },
    }
  }
  return resolveMlsIdByAddress(parsed, options)
}

export function formatAddressLookupLabel(input: AddressLookupInput): string {
  return formatPropertyAddressFull(
    input.street,
    input.city,
    input.postalCode ?? null,
    null,
  )
}
