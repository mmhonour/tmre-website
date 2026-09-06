type ListingWithPropertyTax = {
  raw?: Record<string, string>;
  propertyTax?: number | null;
  propertyTaxYear?: string | null;
  /** Town assessment — set at sync ingest; hydrated from Postgres `data`/`raw`. */
  assessedValue?: number | null;
};

function parseTaxAmount(value: string | undefined): number | null {
  if (value == null || value.trim() === "") return null;
  const n = Number(value.replace(/,/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Matrix / MLS placeholder tax bills are all-nines with 5+ digits
 * ($99,999, $999,999, $9,999,999, …) — the 36 Maple Avenue South
 * "July 2025-June 2026 $999,999 / +9502%" case. $9,999 (4 nines) can
 * be a real small-lot bill and is kept. Assessment placeholders use a
 * different rule in `isPlausibleAssessment`.
 */
export function isPlausibleTaxAmount(
  value: number | null | undefined,
): value is number {
  if (value == null || !Number.isFinite(value) || value <= 0) return false;
  return !/^9{5,}$/.test(String(Math.round(value)));
}

export function plausibleTaxAmount(
  value: number | null | undefined,
): number | null {
  return isPlausibleTaxAmount(value) ? value : null;
}

/**
 * SmartMLS `AssessedValue` (town assessment) from a synced RETS raw record.
 * Rejects the Matrix TBD sentinel (nine 9s) used when assessment is not yet
 * available. Callers must pass Postgres-hydrated `raw` (or sync-time RETS
 * ingest) — listing UI must not live-query RETS for this field.
 */
export function assessedValueFromRaw(
  raw?: Record<string, string>,
): number | null {
  if (!raw) return null;
  const n = parseTaxAmount(raw.AssessedValue);
  if (n == null) return null;
  if (n >= 999_999_999) return null;
  return n;
}

/** Prefer denormalized sync field, else Postgres-stored raw.AssessedValue. */
export function resolveAssessedValue(listing: ListingWithPropertyTax): number | null {
  if (listing.assessedValue != null && Number.isFinite(listing.assessedValue)) {
    const n = listing.assessedValue;
    if (n > 0 && n < 999_999_999) return n;
  }
  return assessedValueFromRaw(listing.raw);
}

/** Annual property tax + fiscal year label from RETS raw fields. */
export function propertyTaxFromRaw(raw?: Record<string, string>): {
  annualAmount: number | null;
  yearLabel: string | null;
} {
  if (!raw) return { annualAmount: null, yearLabel: null };

  const propertyTax = parseTaxAmount(raw.PropertyTax);
  const districtTax = parseTaxAmount(raw.TaxDistrictAmount);
  const annualAmount =
    plausibleTaxAmount(propertyTax) ?? plausibleTaxAmount(districtTax);
  const yearLabel = raw.TaxYear?.trim() || null;

  return { annualAmount, yearLabel };
}

export function formatPropertyTaxLabel(yearLabel: string | null): string {
  return yearLabel ? `Real estate taxes (${yearLabel})` : "Real estate taxes";
}

/** Denormalized tax columns for SQLite listings rows. */
export function propertyTaxDbFields(listing: ListingWithPropertyTax): {
  property_tax: number | null;
  property_tax_year: string | null;
} {
  const fromRaw = propertyTaxFromRaw(listing.raw);
  const property_tax =
    fromRaw.annualAmount ?? plausibleTaxAmount(listing.propertyTax);
  const property_tax_year = fromRaw.yearLabel ?? listing.propertyTaxYear ?? null;
  return { property_tax, property_tax_year };
}

/**
 * Normalize property tax + assessed value on a listing and ensure raw fields
 * are populated so Postgres `data`/`raw` jsonb and UI helpers stay in sync.
 * Intended for sync upsert and DB hydration — not live RETS reads in the UI.
 */
export function applyListingPropertyTax<T extends ListingWithPropertyTax>(
  listing: T,
): T & {
  propertyTax: number | null;
  propertyTaxYear: string | null;
  assessedValue: number | null;
  raw: Record<string, string>;
} {
  const { property_tax, property_tax_year } = propertyTaxDbFields(listing);
  const assessedValue = resolveAssessedValue(listing);
  const raw = { ...(listing.raw ?? {}) };

  if (property_tax != null && !parseTaxAmount(raw.PropertyTax)) {
    raw.PropertyTax = String(Math.round(property_tax));
  }
  if (property_tax_year && !raw.TaxYear?.trim()) {
    raw.TaxYear = property_tax_year;
  }
  if (assessedValue != null && !parseTaxAmount(raw.AssessedValue)) {
    raw.AssessedValue = String(Math.round(assessedValue));
  }

  return {
    ...listing,
    raw,
    propertyTax: property_tax,
    propertyTaxYear: property_tax_year,
    assessedValue,
  };
}

/** Re-derive property tax from raw / cached columns (handles older DB rows). */
export function refreshListingPropertyTax<T extends ListingWithPropertyTax>(
  listing: T,
): ReturnType<typeof applyListingPropertyTax<T>> {
  return applyListingPropertyTax(listing);
}

/** Fiscal year end from RETS TaxYear label (e.g. "July 2025-June 2026" → 2026). */
export function parseTaxYearEnd(yearLabel: string | null | undefined): number | null {
  if (!yearLabel?.trim()) return null;
  const s = yearLabel.trim();
  const rangeMatch = s.match(/[-–—]\s*(?:June|Jul(?:y)?)\s*(\d{4})/i);
  if (rangeMatch) {
    const y = Number(rangeMatch[1]);
    return Number.isFinite(y) ? y : null;
  }
  const years = [...s.matchAll(/\b(20\d{2})\b/g)].map((m) => Number(m[1]));
  if (years.length > 0) return years[years.length - 1] ?? null;
  return null;
}

/** Display label for a fiscal year ending in `taxYearEnd`. */
export function formatTaxYearLabel(taxYearEnd: number): string {
  return `July ${taxYearEnd - 1}-June ${taxYearEnd}`;
}

export function parcelNumberFromRaw(raw?: Record<string, string>): string | null {
  const parcel = raw?.ParcelNumber?.trim();
  return parcel || null;
}

export type PropertyTaxYearEntry = {
  taxYearEnd: number;
  taxYearLabel: string;
  amount: number | null;
  /**
   * Percent change vs the prior fiscal year: `(this − prior) / prior * 100`,
   * rounded to one decimal. Null when either year has no amount.
   */
  yoyChangePct: number | null;
};

/** Signed percent change between two consecutive fiscal-year tax amounts. */
export function taxYoyChangePct(
  amount: number | null,
  priorAmount: number | null | undefined,
): number | null {
  if (
    amount == null ||
    priorAmount == null ||
    !Number.isFinite(amount) ||
    !Number.isFinite(priorAmount) ||
    priorAmount === 0
  ) {
    return null;
  }
  return Math.round(((amount - priorAmount) / priorAmount) * 1000) / 10;
}

/** `+1.3%` / `−1.5%` / `0%` — null when there is no prior year to compare. */
export function formatTaxYoyChange(pct: number | null): string | null {
  if (pct == null || !Number.isFinite(pct)) return null;
  if (pct === 0) return "0%";
  const sign = pct > 0 ? "+" : "−";
  return `${sign}${Math.abs(pct).toFixed(1)}%`;
}

/** Connecticut fiscal year ending year (July–June). Sep 2026 → 2027. */
export function currentFiscalYearEnd(now = new Date()): number {
  return now.getMonth() >= 6 ? now.getFullYear() + 1 : now.getFullYear();
}

/**
 * Coverage lookback when measuring how much of the book has each FY.
 * Pulse median / average / delta use one chosen year, not this whole window.
 */
export const PULSE_TAX_LOOKBACK_YEARS = 5;

/**
 * Share of the Pulse listing book that must have a plausible tax amount
 * for a fiscal year before that year is in play. A handful of new MLS
 * current-year bills must not flip the town comparison.
 */
export const PULSE_TAX_YEAR_QUORUM = 0.8;

/**
 * Sanity floor so an empty book cannot flash a one-row median even if
 * the 80% ratio is vacuously true on a tiny universe.
 */
export const PULSE_TAX_YEAR_MIN_N = 125;

export type PulseTaxYearKind = "current" | "prior";

export type PulseTaxYearDecision = {
  yearEnd: number;
  kind: PulseTaxYearKind;
  ready: boolean;
  listingUniverse: number;
  countCurrent: number;
  countPrior: number;
  pctCurrent: number;
  pctPrior: number;
  quorumPct: number;
  camaHasRun: boolean;
};

export function pulseTaxCoveragePct(
  have: number,
  universe: number,
): number {
  if (universe <= 0) return 0;
  return Math.max(0, have) / universe;
}

export function pulseTaxYearHasQuorum(
  have: number,
  universe: number,
  quorum = PULSE_TAX_YEAR_QUORUM,
): boolean {
  return (
    universe > 0 &&
    have >= PULSE_TAX_YEAR_MIN_N &&
    have / universe >= quorum
  );
}

export function formatPulseTaxCoveragePct(pct: number): string {
  if (!Number.isFinite(pct)) return "0%";
  return `${Math.round(pct * 100)}%`;
}

/** `July 2025-June 2026 · prior` — the year Pulse is comparing. */
export function formatPulseTaxComparedLabel(
  yearEnd: number,
  kind: PulseTaxYearKind,
): string {
  return `${formatTaxYearLabel(yearEnd)} · ${kind}`;
}

export function pulseTaxYearEnds(
  newestYearEnd = currentFiscalYearEnd(),
  count = PULSE_TAX_LOOKBACK_YEARS,
): number[] {
  const n = Math.max(1, Math.floor(count));
  return Array.from({ length: n }, (_, index) => newestYearEnd - index);
}

/** `July 2022-June 2027` for FY ends 2023…2027; single year uses formatTaxYearLabel. */
export function formatPulseTaxWindowLabel(
  yearEnds: readonly number[],
): string {
  if (yearEnds.length === 0) return formatTaxYearLabel(currentFiscalYearEnd());
  const newest = Math.max(...yearEnds);
  const oldest = Math.min(...yearEnds);
  if (oldest === newest) return formatTaxYearLabel(newest);
  return `July ${oldest - 1}-June ${newest}`;
}

export function pulseTaxCoverageIsReady(
  sampleSize: number | null | undefined,
  minN = PULSE_TAX_YEAR_MIN_N,
): boolean {
  return (sampleSize ?? 0) >= minN;
}

/**
 * Pick current FY only at the 80% tipping point. Otherwise stay on prior.
 * Bars stay off until CAMA has run once and the chosen year has quorum.
 */
export function decidePulseTaxYear(input: {
  currentYearEnd: number;
  listingUniverse: number;
  countCurrent: number;
  countPrior: number;
  camaHasRun: boolean;
  quorum?: number;
}): PulseTaxYearDecision {
  const quorum = input.quorum ?? PULSE_TAX_YEAR_QUORUM;
  const universe = Math.max(0, input.listingUniverse);
  const countCurrent = Math.max(0, input.countCurrent);
  const countPrior = Math.max(0, input.countPrior);
  const currentReady = pulseTaxYearHasQuorum(countCurrent, universe, quorum);
  const priorReady = pulseTaxYearHasQuorum(countPrior, universe, quorum);

  const useCurrent = currentReady;
  const yearEnd = useCurrent
    ? input.currentYearEnd
    : input.currentYearEnd - 1;
  const kind: PulseTaxYearKind = useCurrent ? "current" : "prior";
  const yearReady = useCurrent ? currentReady : priorReady;

  return {
    yearEnd,
    kind,
    ready: input.camaHasRun && yearReady,
    listingUniverse: universe,
    countCurrent,
    countPrior,
    pctCurrent: pulseTaxCoveragePct(countCurrent, universe),
    pctPrior: pulseTaxCoveragePct(countPrior, universe),
    quorumPct: quorum,
    camaHasRun: input.camaHasRun,
  };
}

export function choosePulseTaxYearEnd(
  currentYearEnd: number,
  countCurrent: number,
  countPrior: number,
  listingUniverse = Math.max(countCurrent, countPrior),
): number {
  return decidePulseTaxYear({
    currentYearEnd,
    listingUniverse,
    countCurrent,
    countPrior,
    camaHasRun: true,
  }).yearEnd;
}

export function buildPropertyTaxHistorySlots(
  anchorYearEnd: number | null,
  cached: { taxYearEnd: number; taxYearLabel: string; amount: number }[],
  count = 5,
): PropertyTaxYearEntry[] {
  const byYear = new Map(cached.map((row) => [row.taxYearEnd, row]));
  const anchor =
    anchorYearEnd ?? cached[0]?.taxYearEnd ?? currentFiscalYearEnd();

  return Array.from({ length: count }, (_, index) => {
    const taxYearEnd = anchor - index;
    const hit = byYear.get(taxYearEnd);
    const amount = plausibleTaxAmount(hit?.amount ?? null);
    const priorAmount = plausibleTaxAmount(
      byYear.get(taxYearEnd - 1)?.amount ?? null,
    );
    return {
      taxYearEnd,
      taxYearLabel: hit?.taxYearLabel ?? formatTaxYearLabel(taxYearEnd),
      amount,
      yoyChangePct: taxYoyChangePct(amount, priorAmount),
    };
  });
}
