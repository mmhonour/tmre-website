/**
 * Shared Market Pulse settle animation: scramble bars/numbers, then count up
 * from 0 to finals. Used once per property-type tab, then the page stays still.
 */

export type MarketPulseSettlePhase = "scramble" | "countup" | "done";

export type MarketPulseSettleState = {
  phase: MarketPulseSettlePhase;
  /** Scramble frame counter — bumps each random tick. */
  tick: number;
  /** 0 → 1 during countup; 1 when done. */
  countT: number;
};

export const MARKET_PULSE_SETTLE_IDLE: MarketPulseSettleState = {
  phase: "done",
  tick: 0,
  countT: 1,
};

/** Random phase — slower ticks, ~2s longer than the original ~0.65s burst. */
export const SETTLE_SCRAMBLE_MS = 2_600;
export const SETTLE_SCRAMBLE_STEP_MS = 300;
export const SETTLE_COUNTUP_MS = 900;

export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  return Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);
}

export function randomBarPercents(count: number): number[] {
  return Array.from({ length: count }, () => 12 + Math.random() * 88);
}

/** Signed number (Delta $ or %) — scramble, count up through zero, then land. */
export function settleSignedNumber(
  final: number | null | undefined,
  settle: MarketPulseSettleState,
  salt = 0,
  decimals = 0,
): number | null {
  if (final == null || !Number.isFinite(final)) return null;
  const round = (n: number) =>
    decimals <= 0 ? Math.round(n) : Number(n.toFixed(decimals));
  if (settle.phase === "done") return round(final);
  if (settle.phase === "countup") return round(final * settle.countT);
  // Dollars need a wide span so scramble isn't stuck at ±$0.0K.
  const minSpan = decimals > 0 ? 12 : 50_000;
  const span = Math.max(Math.abs(final) * 2.4, minSpan);
  const mag =
    Math.abs(Math.sin((settle.tick + 1) * 12.9898 + salt * 78.233)) * span;
  const sign = Math.sin((settle.tick + 1) * 7.13 + salt * 3.1) < 0 ? -1 : 1;
  return round(mag * sign);
}

/** Integer display during scramble / countup / done. */
export function settleIntDisplay(
  final: number | null | undefined,
  settle: MarketPulseSettleState,
  salt = 0,
): number | null {
  if (final == null || !Number.isFinite(final)) return null;
  if (settle.phase === "done") return Math.round(final);
  if (settle.phase === "countup") {
    return Math.round(final * settle.countT);
  }
  // Deterministic-ish scramble from tick + salt so one frame is stable.
  const span = Math.max(Math.round(Math.abs(final) * 2), 12);
  const n =
    Math.abs(Math.sin((settle.tick + 1) * 12.9898 + salt * 78.233)) * span;
  return Math.round(n);
}

/**
 * Months-supply display — 0.1 mo steps while counting up; random 0.1 steps
 * while scrambling.
 */
export function settleMosDisplay(
  final: number | null | undefined,
  settle: MarketPulseSettleState,
  salt = 0,
): number | null {
  if (final == null || !Number.isFinite(final)) return null;
  if (settle.phase === "done") return final;
  if (settle.phase === "countup") {
    const steps = Math.max(0, Math.round(final / 0.1));
    return Math.floor(steps * settle.countT) * 0.1;
  }
  const maxSteps = Math.max(Math.round(Math.abs(final) * 20), 40);
  const step =
    Math.floor(
      Math.abs(Math.sin((settle.tick + 1) * 19.13 + salt * 43.7)) * maxSteps,
    ) / 10;
  return step;
}

/**
 * All Towns label while bars scramble: cycle town names, then null so the UI
 * lands back on “All towns” for count-up / done.
 */
export function settleAllTownsLabel(
  settle: MarketPulseSettleState,
  townNames: readonly string[],
): string | null {
  if (settle.phase !== "scramble" || townNames.length === 0) return null;
  return townNames[settle.tick % townNames.length] ?? null;
}

/** Bar width % — scramble from local percents, countup 0→settled, done = settled. */
export function settleBarPercent(
  settledPct: number,
  index: number,
  settle: MarketPulseSettleState,
  barScramble: number[] | null,
): number {
  if (settle.phase === "scramble" && barScramble) {
    return barScramble[index] ?? settledPct;
  }
  if (settle.phase === "countup") {
    return settledPct * settle.countT;
  }
  return settledPct;
}
