/**
 * Compact list-price for listing / Spotlight header (right of address).
 *
 * Under $1M: `$875.4K` — thousands + optional hundreds digit (tens/ones dropped).
 * $1M+: `$1.25M` — up to ten-thousands precision; trailing zeros omitted.
 */
export function formatListingHeaderPrice(n: number): string {
  if (!Number.isFinite(n) || n < 0) return "—";

  if (n < 1_000_000) {
    const rounded = Math.round(n / 100) * 100;
    if (rounded >= 1_000_000) return formatListingHeaderPrice(rounded);

    if (rounded < 1_000) {
      return `$${rounded.toLocaleString("en-US")}`;
    }

    const thousands = Math.floor(rounded / 1_000);
    const hundreds = Math.floor((rounded % 1_000) / 100);
    if (hundreds === 0) return `$${thousands}K`;
    return `$${thousands}.${hundreds}K`;
  }

  const rounded = Math.round(n / 10_000) * 10_000;
  const millions = rounded / 1_000_000;
  const trimmed = millions.toFixed(2).replace(/\.?0+$/, "");
  return `$${trimmed}M`;
}
