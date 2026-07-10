function num(v: string | undefined): number | null {
  if (v === undefined || v === null || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

/** Normalize acreage from DB/JSON (number or MLS string like "01.50"). */
export function coerceLotAcres(value: unknown): number | null {
  if (value == null) return null
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed) return null
    const n = Number(trimmed)
    return Number.isFinite(n) ? n : null
  }
  return null
}

/** Display acres without padded zeros (1.50 → 1.5 ac, 2.00 → 2 ac, 0.50 → 0.5 ac). */
export function formatLotAcresLabel(acres: number | null | undefined): string | null {
  const n = coerceLotAcres(acres)
  if (n == null || n <= 0) return null
  if (n < 0.01) return '<0.01 ac'
  const maxFractionDigits = n < 10 ? 2 : 1
  const formatted = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: maxFractionDigits,
  }).format(n)
  const display = formatted.startsWith('0.') ? formatted.slice(1) : formatted
  return `${display} ac`
}

/** Parse lot acreage from raw RETS fields (LotSizeAcres, LotSizeArea, etc.). */
export function parseLotAcresFromRaw(
  raw?: Record<string, string>,
): number | null {
  if (!raw) return null
  const direct =
    num(raw.LotSizeAcres) ??
    num(raw.Acres) ??
    num(raw.LotAcres) ??
    num(raw.TotalAcres)
  if (direct != null && direct > 0) return direct

  const lotArea = num(raw.LotSizeArea) ?? num(raw.LotSize) ?? num(raw.LotSqFt)
  if (lotArea == null || lotArea <= 0) return null

  const units = (raw.LotSizeUnits ?? raw.LotSizeAreaUnits ?? '').toLowerCase()
  if (/acre/i.test(units)) return lotArea
  if (lotArea < 50) return lotArea
  return lotArea / 43_560
}
