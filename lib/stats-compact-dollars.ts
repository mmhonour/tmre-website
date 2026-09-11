/** Compact dollar labels for Stats volume axes and home Volume closed. */
export function formatCompactDollars(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  const abs = Math.abs(n);
  if (abs >= 1_000_000) {
    const m = n / 1_000_000;
    const digits = abs >= 100_000_000 ? 0 : 1;
    return `$${m.toFixed(digits).replace(/\.0$/, "")}M`;
  }
  if (abs >= 1_000) return `$${Math.round(n / 1_000)}K`;
  return `$${Math.round(n).toLocaleString()}`;
}
