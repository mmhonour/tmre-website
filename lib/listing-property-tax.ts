type ListingWithPropertyTax = {
  raw?: Record<string, string>;
  propertyTax?: number | null;
  propertyTaxYear?: string | null;
};

function parseTaxAmount(value: string | undefined): number | null {
  if (value == null || value.trim() === "") return null;
  const n = Number(value.replace(/,/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Annual property tax + fiscal year label from RETS raw fields. */
export function propertyTaxFromRaw(raw?: Record<string, string>): {
  annualAmount: number | null;
  yearLabel: string | null;
} {
  if (!raw) return { annualAmount: null, yearLabel: null };

  const propertyTax = parseTaxAmount(raw.PropertyTax);
  const districtTax = parseTaxAmount(raw.TaxDistrictAmount);
  const annualAmount = propertyTax ?? districtTax;
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
  const property_tax = fromRaw.annualAmount ?? listing.propertyTax ?? null;
  const property_tax_year = fromRaw.yearLabel ?? listing.propertyTaxYear ?? null;
  return { property_tax, property_tax_year };
}

/**
 * Normalize property tax on a listing and ensure raw RETS fields are populated
 * so cached SQLite JSON and UI helpers stay in sync.
 */
export function applyListingPropertyTax<T extends ListingWithPropertyTax>(
  listing: T,
): T & {
  propertyTax: number | null;
  propertyTaxYear: string | null;
  raw: Record<string, string>;
} {
  const { property_tax, property_tax_year } = propertyTaxDbFields(listing);
  const raw = { ...(listing.raw ?? {}) };

  if (property_tax != null && !parseTaxAmount(raw.PropertyTax)) {
    raw.PropertyTax = String(Math.round(property_tax));
  }
  if (property_tax_year && !raw.TaxYear?.trim()) {
    raw.TaxYear = property_tax_year;
  }

  return {
    ...listing,
    raw,
    propertyTax: property_tax,
    propertyTaxYear: property_tax_year,
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
};

/** Connecticut fiscal year ending year (July–June). */
export function currentFiscalYearEnd(): number {
  const now = new Date();
  return now.getMonth() >= 6 ? now.getFullYear() + 1 : now.getFullYear();
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
    return {
      taxYearEnd,
      taxYearLabel: hit?.taxYearLabel ?? formatTaxYearLabel(taxYearEnd),
      amount: hit?.amount ?? null,
    };
  });
}
