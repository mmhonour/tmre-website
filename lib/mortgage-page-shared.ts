/**
 * Client-safe Admin content for /mortgage-rates: commentary blocks, an optional
 * hand-entered spot quote, and the conforming loan-limit table.
 * Server store lives in lib/mortgage-page-config.ts (sync_meta key mortgage_page).
 */

import {
  DEFAULT_CONFORMING_LIMITS,
  type ConformingCountyLimit,
  type ConformingLoanLimits,
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

export type MortgagePageContent = {
  /** Commentary under the rate cards. */
  marketNote: string
  /** Commentary in the buyer strategies section. */
  buyerNote: string
  /** Commentary in the seller / downsizing section. */
  sellerNote: string
  spotQuote: MortgageSpotQuote
  loanLimits: ConformingLoanLimits
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
  updatedAt: null,
}

export const MORTGAGE_NOTE_MAX = 4000
const LABEL_MAX = 120
const COUNTY_MAX = 12

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

function normalizeCounties(raw: unknown): ConformingCountyLimit[] {
  if (!Array.isArray(raw)) {
    return structuredClone(DEFAULT_CONFORMING_LIMITS.counties)
  }
  const counties: ConformingCountyLimit[] = []
  const seen = new Set<string>()
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
    counties.push({
      id,
      label,
      oneUnit: dollars(o.oneUnit, DEFAULT_CONFORMING_LIMITS.baselineOneUnit),
      note: str(o.note, '', 300),
    })
  }
  return counties
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
      baselineOneUnit: dollars(
        limits.baselineOneUnit,
        DEFAULT_CONFORMING_LIMITS.baselineOneUnit,
      ),
      highCostCeiling: dollars(
        limits.highCostCeiling,
        DEFAULT_CONFORMING_LIMITS.highCostCeiling,
      ),
      counties: normalizeCounties(limits.counties),
    },
    updatedAt:
      typeof o.updatedAt === 'string' && o.updatedAt.trim()
        ? o.updatedAt.trim().slice(0, 40)
        : null,
  }
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
