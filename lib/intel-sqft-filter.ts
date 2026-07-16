/** Discrete living-area steps for the intelligence board dual slider. */
export const INTEL_SQFT_STEPS = (() => {
  const steps: number[] = [0];
  for (let sqft = 500; sqft <= 5_000; sqft += 250) {
    steps.push(sqft);
  }
  for (let sqft = 5_500; sqft <= 10_000; sqft += 500) {
    steps.push(sqft);
  }
  return steps;
})();

export const INTEL_SQFT_MAX_INDEX = INTEL_SQFT_STEPS.length - 1;

export function boardSqftMaxIndex(steps: readonly number[]): number {
  return Math.max(0, steps.length - 1);
}

export function clampSqftIndexToSteps(index: number, steps: readonly number[]): number {
  return Math.min(boardSqftMaxIndex(steps), Math.max(0, Math.floor(index)));
}

export function boardListingSqfts(
  listings: { sqft: number | null | undefined; isCommercial?: boolean }[],
): number[] {
  return listings
    .filter((l) => !l.isCommercial)
    .map((l) => l.sqft)
    .filter((s): s is number => s != null && Number.isFinite(s) && s > 0);
}

/** Sqft steps scoped to the current deal board inventory (exact min/max endpoints). */
export function intelSqftStepsForBoard(
  listings: { sqft: number | null | undefined; isCommercial?: boolean }[],
): readonly number[] {
  const sqfts = boardListingSqfts(listings);
  if (sqfts.length === 0) return INTEL_SQFT_STEPS;

  const rawMin = Math.min(...sqfts);
  const rawMax = Math.max(...sqfts);
  if (rawMin >= rawMax) return [rawMin];

  const steps = new Set<number>([rawMin, rawMax]);
  for (const step of INTEL_SQFT_STEPS) {
    if (step > rawMin && step < rawMax) steps.add(step);
  }

  const span = rawMax - rawMin;
  if (span <= 1_500) {
    const increment = span <= 400 ? 50 : span <= 800 ? 100 : 250;
    const start = Math.ceil(rawMin / increment) * increment;
    for (let sqft = start; sqft < rawMax; sqft += increment) {
      if (sqft > rawMin) steps.add(sqft);
    }
  }

  return [...steps].sort((a, b) => a - b);
}

export function defaultSqftIndicesFromBoard(
  listings: { sqft: number | null | undefined; isCommercial?: boolean }[],
): { minIndex: number; maxIndex: number } {
  const steps = intelSqftStepsForBoard(listings);
  return { minIndex: 0, maxIndex: boardSqftMaxIndex(steps) };
}

export function resolveIntelSqftRangeFromSteps(
  steps: readonly number[],
  minIndex: number,
  maxIndex: number,
): { minSqft: number; maxSqft: number | null } {
  if (steps.length === 0) return { minSqft: 0, maxSqft: null };

  const lo = clampSqftIndexToSteps(minIndex, steps);
  const hi = clampSqftIndexToSteps(maxIndex, steps);
  const loI = Math.min(lo, hi);
  const hiI = Math.max(lo, hi);

  return {
    minSqft: steps[loI] ?? 0,
    maxSqft: steps[hiI] ?? null,
  };
}

export function minSqftToStepIndex(sqft: number, steps: readonly number[]): number {
  let index = 0;
  for (let i = 0; i < steps.length; i++) {
    if (steps[i] <= sqft) index = i;
    else break;
  }
  return index;
}

export function maxSqftToStepIndex(sqft: number, steps: readonly number[]): number {
  for (let i = 0; i < steps.length; i++) {
    if (steps[i] >= sqft) return i;
  }
  return boardSqftMaxIndex(steps);
}

export function parseIntelSqftInput(raw: string): number | null {
  const s = raw.trim().replace(/[,\s]/g, "");
  if (!s) return null;
  const kMatch = s.match(/^(\d+(?:\.\d+)?)k$/i);
  if (kMatch) return Math.round(parseFloat(kMatch[1]) * 1_000);
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
}

export function intelSqftScrollIncrement(sqft: number): number {
  if (sqft <= 1_000) return 50;
  if (sqft <= 3_000) return 100;
  if (sqft <= 6_000) return 250;
  return 500;
}

export function adjustIntelSqftByWheel(
  sqft: number,
  deltaY: number,
  floor: number,
  ceiling: number,
): number {
  if (deltaY === 0) return sqft;
  const increase = deltaY < 0;
  const step = intelSqftScrollIncrement(sqft);
  const next = increase ? sqft + step : sqft - step;
  return Math.max(floor, Math.min(ceiling, next));
}

export function formatIntelSqftStep(sqft: number): string {
  if (sqft <= 0) return "0";
  if (sqft >= 1_000) {
    const thousands = sqft / 1_000;
    return Number.isInteger(thousands)
      ? `${thousands}K`
      : `${thousands.toFixed(1)}K`;
  }
  return sqft.toLocaleString();
}

export function formatIntelSqftRangeLabelFromSteps(
  steps: readonly number[],
  minIndex: number,
  maxIndex: number,
): string {
  const maxIdx = boardSqftMaxIndex(steps);
  const lo = clampSqftIndexToSteps(minIndex, steps);
  const hi = clampSqftIndexToSteps(maxIndex, steps);
  const { minSqft, maxSqft } = resolveIntelSqftRangeFromSteps(steps, lo, hi);

  if (lo === 0 && hi === maxIdx && steps.length > 0) {
    if (minSqft === maxSqft) return `${formatIntelSqftStep(minSqft)} sqft`;
    return `${formatIntelSqftStep(minSqft)}–${formatIntelSqftStep(maxSqft ?? minSqft)} sqft`;
  }

  if (minSqft === 0 && maxSqft == null) return "Any sqft";
  if (minSqft === 0 && maxSqft != null) {
    return `Up to ${formatIntelSqftStep(maxSqft)} sqft`;
  }
  if (maxSqft == null) return `${formatIntelSqftStep(minSqft)}+ sqft`;
  if (minSqft === maxSqft) return `${formatIntelSqftStep(minSqft)} sqft`;
  return `${formatIntelSqftStep(minSqft)}–${formatIntelSqftStep(maxSqft)} sqft`;
}

export function intelSqftFilterActiveOnBoard(
  minIndex: number,
  maxIndex: number,
  steps: readonly number[],
): boolean {
  const maxIdx = boardSqftMaxIndex(steps);
  const lo = clampSqftIndexToSteps(minIndex, steps);
  const hi = clampSqftIndexToSteps(maxIndex, steps);
  return lo !== 0 || hi !== maxIdx;
}

export function listingMatchesIntelSqftRange(
  sqft: number | null | undefined,
  minSqft: number,
  maxSqft: number | null,
): boolean {
  if (minSqft <= 0 && maxSqft == null) return true;
  if (sqft == null || !Number.isFinite(sqft) || sqft <= 0) return false;
  if (minSqft > 0 && sqft < minSqft) return false;
  if (maxSqft != null && sqft > maxSqft) return false;
  return true;
}
