import type { AddressIndex } from '@/lib/address-index/decode'
import {
  HOUSE_NUMBER_PATTERN,
  houseNumberValue,
  normalizeStreetText,
} from '@/lib/address-index/schema'

export type AddressIndexSuggestion = {
  /** A single home, or a street with several homes behind it. */
  kind: 'address' | 'street'
  label: string
  town: string
  zip: string | null
  mlsId: string | null
  onMarket: boolean
  rental: boolean
  /** Thousands: sale price, or monthly rent when `rental`. */
  priceK: number | null
  closeYear: number | null
  /** Homes on the street — 1 for an address row. */
  addresses: number
  streetIdx: number
  row: number
}

export type AddressIndexSearchOptions = {
  limit?: number
  /** Soft rank bump, never a filter: the visitor's own town floats up. */
  biasTown?: string | null
  /** Hard filter — set only when a town pill is selected. */
  town?: string | null
}

type StreetHit = { streetIdx: number; score: number }

const STREET_SCORE_PREFIX = 4
const STREET_SCORE_WORD = 3
const STREET_SCORE_CONTAINS = 2

/**
 * Match the street dictionary first (a few thousand entries), then expand only
 * the streets that hit. That two-level shape is what keeps a keystroke in low
 * single-digit milliseconds on an 18k-address index.
 */
function matchStreets(
  index: AddressIndex,
  needle: string,
  townIdx: number | null,
): StreetHit[] {
  const hits: StreetHit[] = []
  if (!needle) return hits

  for (let i = 0; i < index.streetMatch.length; i += 1) {
    if (townIdx != null && index.streetTown[i] !== townIdx) continue
    const candidate = index.streetMatch[i]!
    let score = 0
    if (candidate.startsWith(needle)) {
      score = STREET_SCORE_PREFIX
    } else {
      const at = candidate.indexOf(needle)
      if (at > 0) {
        score = candidate[at - 1] === ' ' ? STREET_SCORE_WORD : STREET_SCORE_CONTAINS
      }
    }
    if (score > 0) hits.push({ streetIdx: i, score })
  }
  return hits
}

function townOf(index: AddressIndex, streetIdx: number): string {
  return index.towns[index.streetTown[streetIdx] ?? 0] ?? ''
}

function addressSuggestion(index: AddressIndex, row: number): AddressIndexSuggestion {
  const streetIdx = index.street[row]!
  const house = index.house[row]!
  const street = index.streetNames[streetIdx] ?? ''
  return {
    kind: 'address',
    label: house ? `${house} ${street}` : street,
    town: townOf(index, streetIdx),
    zip: index.zip[row] ?? null,
    mlsId: index.mlsId[row] || null,
    onMarket: index.onMarket[row] === 1,
    rental: index.rental[row] === 1,
    priceK: index.priceK[row]! > 0 ? index.priceK[row]! : null,
    closeYear: index.closeYear[row]! > 0 ? index.closeYear[row]! : null,
    addresses: 1,
    streetIdx,
    row,
  }
}

function streetSuggestion(index: AddressIndex, streetIdx: number): AddressIndexSuggestion {
  const rows = index.byStreet[streetIdx] ?? []
  return {
    kind: 'street',
    label: index.streetNames[streetIdx] ?? '',
    town: townOf(index, streetIdx),
    zip: rows.length > 0 ? (index.zip[rows[0]!] ?? null) : null,
    mlsId: null,
    onMarket: false,
    rental: false,
    priceK: null,
    closeYear: null,
    addresses: rows.length,
    streetIdx,
    row: -1,
  }
}

/** Strip a trailing town from the query and return it as a filter. */
function splitTown(
  index: AddressIndex,
  cleaned: string,
): { text: string; townIdx: number | null } {
  const commaParts = cleaned.split(',').map((part) => part.trim()).filter(Boolean)
  if (commaParts.length > 1) {
    const tail = commaParts[commaParts.length - 1]!.replace(/\s+ct$/, '').trim()
    const townIdx = index.towns.findIndex((town) => town.toLowerCase() === tail)
    if (townIdx >= 0) {
      return { text: commaParts.slice(0, -1).join(' ').trim(), townIdx }
    }
  }

  for (let i = 0; i < index.towns.length; i += 1) {
    const town = index.towns[i]!.toLowerCase()
    if (cleaned.length > town.length + 1 && cleaned.endsWith(` ${town}`)) {
      return { text: cleaned.slice(0, -(town.length + 1)).trim(), townIdx: i }
    }
  }

  return { text: cleaned.replace(/,/g, ' ').replace(/\s+/g, ' ').trim(), townIdx: null }
}

function biasOf(index: AddressIndex, biasIdx: number, streetIdx: number): number {
  return biasIdx >= 0 && index.streetTown[streetIdx] === biasIdx ? 1 : 0
}

/**
 * Streets, or the homes on a single street. Used both when no house number was
 * typed and when a typed number has no match — a street with 40 homes on it is
 * a better answer than an empty dropdown.
 */
function streetResults(
  index: AddressIndex,
  streetHits: StreetHit[],
  limit: number,
  biasIdx: number,
  nearHouse = -1,
): AddressIndexSuggestion[] {
  const sorted = [...streetHits].sort(
    (a, b) =>
      b.score - a.score ||
      biasOf(index, biasIdx, b.streetIdx) - biasOf(index, biasIdx, a.streetIdx) ||
      (index.byStreet[b.streetIdx]?.length ?? 0) - (index.byStreet[a.streetIdx]?.length ?? 0) ||
      (index.streetNames[a.streetIdx] ?? '').localeCompare(index.streetNames[b.streetIdx] ?? ''),
  )

  // One street matched: show its homes rather than a group of one.
  if (sorted.length === 1) {
    const rows = [...(index.byStreet[sorted[0]!.streetIdx] ?? [])]
    rows.sort((a, b) => {
      if (nearHouse >= 0) {
        const da = Math.abs((index.houseValue[a] ?? 0) - nearHouse)
        const db = Math.abs((index.houseValue[b] ?? 0) - nearHouse)
        if (da !== db) return da - db
      }
      return (
        (index.onMarket[b]! - index.onMarket[a]!) ||
        (index.houseValue[a]! - index.houseValue[b]!)
      )
    })
    return rows.slice(0, limit).map((row) => addressSuggestion(index, row))
  }

  return sorted.slice(0, limit).map((hit) => streetSuggestion(index, hit.streetIdx))
}

export function searchAddressIndex(
  index: AddressIndex,
  rawQuery: string,
  options: AddressIndexSearchOptions = {},
): AddressIndexSuggestion[] {
  const limit = Math.min(Math.max(options.limit ?? 8, 1), 50)
  const cleaned = rawQuery.toLowerCase().replace(/\s+/g, ' ').trim()
  if (cleaned.length < 2) return []

  const pinnedTown = options.town?.trim().toLowerCase() ?? ''
  const pinnedIdx = pinnedTown
    ? index.towns.findIndex((town) => town.toLowerCase() === pinnedTown)
    : -1

  const parsed = splitTown(index, cleaned)
  const townIdx = pinnedIdx >= 0 ? pinnedIdx : parsed.townIdx
  const text = parsed.text
  if (!text) return []

  const biasTown = options.biasTown?.trim().toLowerCase() ?? ''
  const biasIdx = biasTown
    ? index.towns.findIndex((town) => town.toLowerCase() === biasTown)
    : -1

  // An MLS id: the only all-digit query long enough to be unambiguous.
  if (/^\d{6,}$/.test(text)) {
    const out: AddressIndexSuggestion[] = []
    for (let row = 0; row < index.addresses && out.length < limit; row += 1) {
      if (index.mlsId[row]!.startsWith(text)) out.push(addressSuggestion(index, row))
    }
    return out
  }

  // A zip: grouped by street, so five digits answer with neighbourhoods.
  if (/^\d{5}$/.test(text)) {
    const streetIdxs = new Set<number>()
    for (let row = 0; row < index.addresses; row += 1) {
      if (index.zip[row] === text) streetIdxs.add(index.street[row]!)
    }
    if (streetIdxs.size > 0) {
      const hits = [...streetIdxs].map((streetIdx) => ({ streetIdx, score: STREET_SCORE_PREFIX }))
      return streetResults(index, hits, limit, biasIdx)
    }
  }

  const houseMatch = text.match(HOUSE_NUMBER_PATTERN)
  const house = houseMatch ? houseMatch[1]!.replace(/\s*([-/])\s*/g, '$1') : ''
  const streetText = houseMatch ? houseMatch[2]!.trim() : text
  const needle = normalizeStreetText(streetText)

  // Bare house number with no street yet — nothing useful to rank on.
  if (!needle) return []

  const streetHits = matchStreets(index, needle, townIdx)
  if (streetHits.length === 0) return []

  if (house) {
    const houseValue = houseNumberValue(house)
    const scored: { suggestion: AddressIndexSuggestion; score: number }[] = []

    for (const hit of streetHits) {
      for (const row of index.byStreet[hit.streetIdx] ?? []) {
        const rowHouse = index.house[row]!.toLowerCase()
        let houseScore = 0
        if (rowHouse === house) houseScore = 3
        else if (houseValue >= 0 && index.houseValue[row] === houseValue) houseScore = 2
        else if (rowHouse.startsWith(house)) houseScore = 1
        if (houseScore === 0) continue

        scored.push({
          suggestion: addressSuggestion(index, row),
          score:
            houseScore * 100 +
            hit.score * 10 +
            biasOf(index, biasIdx, hit.streetIdx) * 4 +
            (index.onMarket[row] === 1 ? 2 : 0),
        })
      }
    }

    if (scored.length > 0) {
      scored.sort(
        (a, b) =>
          b.score - a.score ||
          (index.houseValue[a.suggestion.row]! - index.houseValue[b.suggestion.row]!) ||
          a.suggestion.label.localeCompare(b.suggestion.label),
      )
      return scored.slice(0, limit).map((entry) => entry.suggestion)
    }

    // The street exists but that number has never sold — offer its neighbours.
    return streetResults(index, streetHits, limit, biasIdx, houseValue)
  }

  return streetResults(index, streetHits, limit, biasIdx)
}
