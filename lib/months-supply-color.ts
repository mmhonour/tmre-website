/** Scale endpoints for months-supply color (low = seller's / red, high = buyer's / green). */
export const MONTHS_SUPPLY_COLOR_MIN = 1;
export const MONTHS_SUPPLY_COLOR_MAX = 6;

const CORAL = { r: 0xc8, g: 0x5a, b: 0x3a };
const SAGE = { r: 0x4a, g: 0x7c, b: 0x6f };

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/** Interpolate coral → sage by months supply (red = lowest, green = highest). */
export function monthsSupplyColor(
  monthsSupply: number | null | undefined,
): string | null {
  if (monthsSupply == null || !Number.isFinite(monthsSupply)) return null;
  const span = MONTHS_SUPPLY_COLOR_MAX - MONTHS_SUPPLY_COLOR_MIN;
  const t =
    span <= 0
      ? 1
      : clamp01((monthsSupply - MONTHS_SUPPLY_COLOR_MIN) / span);
  const r = Math.round(CORAL.r + (SAGE.r - CORAL.r) * t);
  const g = Math.round(CORAL.g + (SAGE.g - CORAL.g) * t);
  const b = Math.round(CORAL.b + (SAGE.b - CORAL.b) * t);
  return `rgb(${r}, ${g}, ${b})`;
}

export function monthsSupplyColorStyle(
  monthsSupply: number | null | undefined,
): { color: string } | undefined {
  const color = monthsSupplyColor(monthsSupply);
  return color ? { color } : undefined;
}
