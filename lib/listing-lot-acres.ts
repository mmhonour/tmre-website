function num(v: string | undefined): number | null {
  if (v === undefined || v === null || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
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
