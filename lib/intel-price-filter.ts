/** Discrete price steps for the intelligence board dual slider. */
export const INTEL_PRICE_STEPS = (() => {
  const steps: number[] = [];
  for (let price = 0; price <= 5_000_000; price += 500_000) {
    steps.push(price);
  }
  for (let price = 6_000_000; price <= 10_000_000; price += 1_000_000) {
    steps.push(price);
  }
  return steps;
})();

export const INTEL_PRICE_MAX_INDEX = INTEL_PRICE_STEPS.length - 1;

export const INTEL_PRICE_INDEX_VALUES = INTEL_PRICE_STEPS.map((_, index) =>
  String(index),
) as readonly string[];

export type IntelPriceIndex = (typeof INTEL_PRICE_INDEX_VALUES)[number];

export function clampPriceIndex(index: number): number {
  return Math.min(INTEL_PRICE_MAX_INDEX, Math.max(0, Math.floor(index)));
}

export function priceFromIndex(index: number): number {
  return INTEL_PRICE_STEPS[clampPriceIndex(index)] ?? 0;
}

/** Largest slider step that does not exceed this price (for min bound). */
export function minPriceToIndex(price: number): number {
  let index = 0;
  for (let i = 0; i < INTEL_PRICE_STEPS.length; i++) {
    if (INTEL_PRICE_STEPS[i] <= price) index = i;
    else break;
  }
  return index;
}

/** Smallest slider step that covers this price (for max bound). */
export function maxPriceToIndex(price: number): number {
  for (let i = 0; i < INTEL_PRICE_STEPS.length; i++) {
    if (INTEL_PRICE_STEPS[i] >= price) return i;
  }
  return INTEL_PRICE_MAX_INDEX;
}

/** Largest board step that does not exceed this price (for min bound). */
export function minPriceToStepIndex(price: number, steps: readonly number[]): number {
  let index = 0;
  for (let i = 0; i < steps.length; i++) {
    if (steps[i] <= price) index = i;
    else break;
  }
  return index;
}

/** Smallest board step that covers this price (for max bound). */
export function maxPriceToStepIndex(price: number, steps: readonly number[]): number {
  for (let i = 0; i < steps.length; i++) {
    if (steps[i] >= price) return i;
  }
  return boardPriceMaxIndex(steps);
}

/** Parse typed currency into a whole-dollar amount. */
export function parseIntelPriceInput(raw: string): number | null {
  const s = raw.trim().replace(/[$,\s]/g, "");
  if (!s) return null;
  const mMatch = s.match(/^(\d+(?:\.\d+)?)m$/i);
  if (mMatch) return Math.round(parseFloat(mMatch[1]) * 1_000_000);
  const kMatch = s.match(/^(\d+(?:\.\d+)?)k$/i);
  if (kMatch) return Math.round(parseFloat(kMatch[1]) * 1_000);
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
}

const INTEL_PRICE_SCROLL_SPLIT = 4_000_000;

/** $500K steps at or below $4M; $1M steps above $4M (wheel on price bound inputs). */
export function intelPriceScrollIncrement(price: number): number {
  return price > INTEL_PRICE_SCROLL_SPLIT ? 1_000_000 : 500_000;
}

/** Adjust a bound price via mouse wheel; clamps to listing min/max for the current board. */
export function adjustIntelPriceByWheel(
  price: number,
  deltaY: number,
  floor: number,
  ceiling: number,
): number {
  if (deltaY === 0) return price;
  const increase = deltaY < 0;
  const step = intelPriceScrollIncrement(price);
  const next = increase ? price + step : price - step;
  return Math.max(floor, Math.min(ceiling, next));
}

export function boardListingPrices(
  listings: { price: number | null | undefined; isRental?: boolean }[],
): number[] {
  return listings
    .filter((l) => !l.isRental)
    .map((l) => l.price)
    .filter((p): p is number => p != null && Number.isFinite(p) && p > 0);
}

/** Price steps scoped to the current deal board inventory (exact min/max endpoints). */
export function intelPriceStepsForBoard(
  listings: { price: number | null | undefined; isRental?: boolean }[],
): readonly number[] {
  const prices = boardListingPrices(listings);
  if (prices.length === 0) return INTEL_PRICE_STEPS;

  const rawMin = Math.min(...prices);
  const rawMax = Math.max(...prices);
  if (rawMin >= rawMax) return [rawMin];

  const steps = new Set<number>([rawMin, rawMax]);
  for (const step of INTEL_PRICE_STEPS) {
    if (step > rawMin && step < rawMax) steps.add(step);
  }

  // Finer steps when the board span is narrow and $500K ticks are too coarse.
  const span = rawMax - rawMin;
  if (span <= 1_500_000) {
    const increment = span <= 400_000 ? 25_000 : 50_000;
    const start = Math.ceil(rawMin / increment) * increment;
    for (let price = start; price < rawMax; price += increment) {
      if (price > rawMin) steps.add(price);
    }
  }

  return [...steps].sort((a, b) => a - b);
}

export function boardPriceMaxIndex(steps: readonly number[]): number {
  return Math.max(0, steps.length - 1);
}

export function clampPriceIndexToSteps(index: number, steps: readonly number[]): number {
  return Math.min(boardPriceMaxIndex(steps), Math.max(0, Math.floor(index)));
}

export function priceFromStepIndex(steps: readonly number[], index: number): number {
  return steps[clampPriceIndexToSteps(index, steps)] ?? 0;
}

export function resolveIntelPriceRangeFromSteps(
  steps: readonly number[],
  minIndex: number,
  maxIndex: number,
): { minPrice: number; maxPrice: number | null } {
  if (steps.length === 0) return { minPrice: 0, maxPrice: null };

  const lo = clampPriceIndexToSteps(minIndex, steps);
  const hi = clampPriceIndexToSteps(maxIndex, steps);
  const loI = Math.min(lo, hi);
  const hiI = Math.max(lo, hi);

  return {
    minPrice: steps[loI] ?? 0,
    maxPrice: steps[hiI] ?? null,
  };
}

export function formatIntelPriceRangeLabelFromSteps(
  steps: readonly number[],
  minIndex: number,
  maxIndex: number,
): string {
  const maxIdx = boardPriceMaxIndex(steps);
  const lo = clampPriceIndexToSteps(minIndex, steps);
  const hi = clampPriceIndexToSteps(maxIndex, steps);
  const { minPrice, maxPrice } = resolveIntelPriceRangeFromSteps(steps, lo, hi);

  if (lo === 0 && hi === maxIdx && steps.length > 0) {
    if (minPrice === maxPrice) return formatIntelPriceStep(minPrice);
    return `${formatIntelPriceStep(minPrice)}–${formatIntelPriceStep(maxPrice ?? minPrice)}`;
  }

  if (minPrice === 0 && maxPrice == null) return "Any Price";
  if (minPrice === 0 && maxPrice != null) {
    return `Up to ${formatIntelPriceStep(maxPrice)}`;
  }
  if (maxPrice == null) return `${formatIntelPriceStep(minPrice)}+`;
  if (minPrice === maxPrice) return formatIntelPriceStep(minPrice);
  return `${formatIntelPriceStep(minPrice)}–${formatIntelPriceStep(maxPrice)}`;
}

export function intelPriceFilterActiveOnBoard(
  minIndex: number,
  maxIndex: number,
  steps: readonly number[],
): boolean {
  const maxIdx = boardPriceMaxIndex(steps);
  const lo = clampPriceIndexToSteps(minIndex, steps);
  const hi = clampPriceIndexToSteps(maxIndex, steps);
  return lo !== 0 || hi !== maxIdx;
}

export function defaultPriceIndicesFromBoard(
  listings: { price: number | null | undefined; isRental?: boolean }[],
): { minIndex: number; maxIndex: number } {
  const steps = intelPriceStepsForBoard(listings);
  return { minIndex: 0, maxIndex: boardPriceMaxIndex(steps) };
}

export function resolveIntelPriceRange(
  minIndex: number,
  maxIndex: number,
): { minPrice: number; maxPrice: number | null } {
  const min = clampPriceIndex(minIndex);
  const max = clampPriceIndex(maxIndex);
  const lo = Math.min(min, max);
  const hi = Math.max(min, max);
  return {
    minPrice: priceFromIndex(lo),
    maxPrice: hi >= INTEL_PRICE_MAX_INDEX ? null : priceFromIndex(hi),
  };
}

export function formatIntelPriceStep(price: number): string {
  if (price <= 0) return "$0";
  if (price >= 1_000_000) {
    const millions = price / 1_000_000;
    return Number.isInteger(millions)
      ? `$${millions}M`
      : `$${millions.toFixed(1)}M`;
  }
  if (price >= 1_000) return `$${Math.round(price / 1_000)}K`;
  return `$${price.toLocaleString()}`;
}

export function formatIntelPriceRangeLabel(
  minIndex: number,
  maxIndex: number,
): string {
  const { minPrice, maxPrice } = resolveIntelPriceRange(minIndex, maxIndex);
  if (minPrice === 0 && maxPrice == null) return "Any Price";
  if (minPrice === 0 && maxPrice != null) {
    return `Up to ${formatIntelPriceStep(maxPrice)}`;
  }
  if (maxPrice == null) return `${formatIntelPriceStep(minPrice)}+`;
  if (minPrice === maxPrice) return formatIntelPriceStep(minPrice);
  return `${formatIntelPriceStep(minPrice)}–${formatIntelPriceStep(maxPrice)}`;
}

export function intelPriceFilterActive(
  minIndex: number,
  maxIndex: number,
  defaultMinIndex: number,
  defaultMaxIndex: number,
): boolean {
  const min = clampPriceIndex(minIndex);
  const max = clampPriceIndex(maxIndex);
  return min !== defaultMinIndex || max !== defaultMaxIndex;
}

export function listingMatchesIntelPriceRange(
  price: number | null | undefined,
  minPrice: number,
  maxPrice: number | null,
): boolean {
  if (minPrice <= 0 && maxPrice == null) return true;
  if (price == null || !Number.isFinite(price) || price <= 0) return false;
  if (minPrice > 0 && price < minPrice) return false;
  if (maxPrice != null && price > maxPrice) return false;
  return true;
}
