/**
 * Client-safe Admin content for /mortgage-rates: commentary blocks, an optional
 * hand-entered spot quote, and the conforming loan-limit table.
 * Server store lives in lib/mortgage-page-config.ts (sync_meta key mortgage_page).
 */

import {
  DEFAULT_CONFORMING_LIMITS,
  type ConformingCountyLimit,
  type ConformingLoanLimits,
  type ConformingUnitLimits,
} from '@/lib/mortgage-rates-shared'

export type MortgageSpotQuote = {
  /** When false the page shows FRED averages only. */
  enabled: boolean
  label: string
  /** Free text so "6.5% / 0 pts, 30-yr jumbo" is expressible. */
  rate: string
  terms: string
  /** Human "as of" — e.g. "Aug 5, 2026, 9:00 a.m." */
  asOf: string
}

/** Preferred lender card on /mortgage-rates (Admin-maintained). */
export type MortgagePreferredLender = {
  id: string
  name: string
  /** Lowest down-payment options / notes tied to CLL context. */
  minDownNote: string
  /** Optional outbound link. */
  url: string
  note: string
}

export type MortgagePageContent = {
  /** Commentary under the rate cards. */
  marketNote: string
  /** Commentary in the buyer strategies section. */
  buyerNote: string
  /** Commentary in the seller / downsizing section. */
  sellerNote: string
  spotQuote: MortgageSpotQuote
  loanLimits: ConformingLoanLimits
  preferredLenders: MortgagePreferredLender[]
  /** Stamped server-side on save. */
  updatedAt: string | null
}

export const DEFAULT_MORTGAGE_PAGE_CONTENT: MortgagePageContent = {
  marketNote: '',
  buyerNote: '',
  sellerNote: '',
  spotQuote: {
    enabled: false,
    label: 'Today’s quoted rate',
    rate: '',
    terms: '',
    asOf: '',
  },
  loanLimits: DEFAULT_CONFORMING_LIMITS,
  preferredLenders: [],
  updatedAt: null,
}

export const MORTGAGE_NOTE_MAX = 4000
const LABEL_MAX = 120
const COUNTY_MAX = 12
const LENDER_MAX = 24
const TOWN_LIST_MAX = 40

function str(raw: unknown, fallback: string, max: number): string {
  if (typeof raw !== 'string') return fallback
  return raw.trim().slice(0, max)
}

function bool(raw: unknown, fallback: boolean): boolean {
  return typeof raw === 'boolean' ? raw : fallback
}

function dollars(raw: unknown, fallback: number): number {
  const n = typeof raw === 'number' ? raw : Number(raw)
  if (!Number.isFinite(n) || n <= 0) return fallback
  return Math.min(Math.round(n), 100_000_000)
}

function limitYear(raw: unknown, fallback: number): number {
  const n = typeof raw === 'number' ? raw : Number(raw)
  if (!Number.isFinite(n)) return fallback
  const year = Math.round(n)
  return year >= 2000 && year <= 2100 ? year : fallback
}

/** Fill 2–4 unit cells; scale from the 1-unit figure using the fallback ladder. */
function completeUnitLimits(
  raw: Record<string, unknown> | null | undefined,
  fallback: ConformingUnitLimits,
): ConformingUnitLimits {
  const one = dollars(raw?.oneUnit, fallback.oneUnit)
  const scale = (target: number) =>
    Math.round(one * (target / fallback.oneUnit))
  return {
    oneUnit: one,
    twoUnit: dollars(raw?.twoUnit, scale(fallback.twoUnit)),
    threeUnit: dollars(raw?.threeUnit, scale(fallback.threeUnit)),
    fourUnit: dollars(raw?.fourUnit, scale(fallback.fourUnit)),
  }
}

function asUnitRecord(raw: unknown): Record<string, unknown> | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  return raw as Record<string, unknown>
}

/**
 * Accept nested `{ oneUnit… }` or legacy top-level `baselineOneUnit` /
 * numeric `highCostCeiling`.
 */
function normalizeBaseline(limits: Record<string, unknown>): ConformingUnitLimits {
  const nested = asUnitRecord(limits.baseline)
  if (nested) return completeUnitLimits(nested, DEFAULT_CONFORMING_LIMITS.baseline)
  return completeUnitLimits(
    { oneUnit: limits.baselineOneUnit },
    DEFAULT_CONFORMING_LIMITS.baseline,
  )
}

function normalizeHighCostCeiling(
  limits: Record<string, unknown>,
): ConformingUnitLimits {
  const nested = asUnitRecord(limits.highCostCeiling)
  if (nested) {
    return completeUnitLimits(nested, DEFAULT_CONFORMING_LIMITS.highCostCeiling)
  }
  if (typeof limits.highCostCeiling === 'number') {
    return completeUnitLimits(
      { oneUnit: limits.highCostCeiling },
      DEFAULT_CONFORMING_LIMITS.highCostCeiling,
    )
  }
  return structuredClone(DEFAULT_CONFORMING_LIMITS.highCostCeiling)
}

function normalizeTowns(raw: unknown, fallback: readonly string[]): string[] {
  const fromArray = Array.isArray(raw)
    ? raw
        .filter((t): t is string => typeof t === 'string')
        .map((t) => t.trim())
        .filter(Boolean)
    : typeof raw === 'string'
      ? raw
          .split(/[,;\n]+/)
          .map((t) => t.trim())
          .filter(Boolean)
      : []
  const source = fromArray.length > 0 ? fromArray : [...fallback]
  const seen = new Set<string>()
  const out: string[] = []
  for (const town of source.slice(0, TOWN_LIST_MAX)) {
    const key = town.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(town.slice(0, 60))
  }
  return out
}

function normalizeCounties(
  raw: unknown,
  baseline: ConformingUnitLimits,
): ConformingCountyLimit[] {
  if (!Array.isArray(raw)) {
    return structuredClone(DEFAULT_CONFORMING_LIMITS.counties)
  }
  const counties: ConformingCountyLimit[] = []
  const seen = new Set<string>()
  const defaultById = new Map(
    DEFAULT_CONFORMING_LIMITS.counties.map((c) => [c.id, c]),
  )
  for (const row of raw.slice(0, COUNTY_MAX)) {
    if (!row || typeof row !== 'object') continue
    const o = row as Record<string, unknown>
    const label = str(o.label, '', LABEL_MAX)
    if (!label) continue
    const id =
      str(o.id, '', 40) ||
      label
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '')
        .slice(0, 40)
    if (!id || seen.has(id)) continue
    seen.add(id)
    const units = completeUnitLimits(o, baseline)
    const fallbackTowns = defaultById.get(id)?.towns ?? []
    counties.push({
      id,
      label,
      ...units,
      note: str(o.note, '', 300),
      towns: normalizeTowns(o.towns, fallbackTowns),
    })
  }
  return counties
}

function normalizePreferredLenders(raw: unknown): MortgagePreferredLender[] {
  if (!Array.isArray(raw)) return []
  const out: MortgagePreferredLender[] = []
  const seen = new Set<string>()
  for (const row of raw.slice(0, LENDER_MAX)) {
    if (!row || typeof row !== 'object') continue
    const o = row as Record<string, unknown>
    const name = str(o.name, '', LABEL_MAX)
    if (!name) continue
    const id =
      str(o.id, '', 40) ||
      name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '')
        .slice(0, 40)
    if (!id || seen.has(id)) continue
    seen.add(id)
    out.push({
      id,
      name,
      minDownNote: str(o.minDownNote, '', 200),
      url: str(o.url, '', 300),
      note: str(o.note, '', 400),
    })
  }
  return out
}

export function normalizeMortgagePageContent(raw: unknown): MortgagePageContent {
  const defaults = structuredClone(DEFAULT_MORTGAGE_PAGE_CONTENT)
  if (!raw || typeof raw !== 'object') return defaults

  const o = raw as Record<string, unknown>
  const spot =
    o.spotQuote && typeof o.spotQuote === 'object'
      ? (o.spotQuote as Record<string, unknown>)
      : {}
  const limits =
    o.loanLimits && typeof o.loanLimits === 'object'
      ? (o.loanLimits as Record<string, unknown>)
      : {}

  const baseline = normalizeBaseline(limits)
  const highCostCeiling = normalizeHighCostCeiling(limits)

  return {
    marketNote: str(o.marketNote, '', MORTGAGE_NOTE_MAX),
    buyerNote: str(o.buyerNote, '', MORTGAGE_NOTE_MAX),
    sellerNote: str(o.sellerNote, '', MORTGAGE_NOTE_MAX),
    spotQuote: {
      enabled: bool(spot.enabled, false),
      label: str(spot.label, defaults.spotQuote.label, LABEL_MAX),
      rate: str(spot.rate, '', 60),
      terms: str(spot.terms, '', 300),
      asOf: str(spot.asOf, '', 80),
    },
    loanLimits: {
      year: limitYear(limits.year, DEFAULT_CONFORMING_LIMITS.year),
      baseline,
      highCostCeiling,
      counties: normalizeCounties(limits.counties, baseline),
    },
    preferredLenders: normalizePreferredLenders(o.preferredLenders),
    updatedAt:
      typeof o.updatedAt === 'string' && o.updatedAt.trim()
        ? o.updatedAt.trim().slice(0, 40)
        : null,
  }
}

export function hasPreferredLenders(
  lenders: readonly MortgagePreferredLender[],
): boolean {
  return lenders.some((l) => l.name.trim().length > 0)
}

/** Split an Admin note into paragraphs for rendering (blank line = new block). */
export function noteParagraphs(note: string): string[] {
  return note
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
}

export function hasSpotQuote(quote: MortgageSpotQuote): boolean {
  return quote.enabled && quote.rate.trim().length > 0
}
