"use client";

import { formatClosedDayLabel } from "@/lib/closed-shared";

type ClosedLookbackRangeSliderProps = {
  days: string[];
  startIndex: number;
  endIndex: number;
  onStartChange: (index: number) => void;
  onEndChange: (index: number) => void;
};

function clampMin(next: number, hi: number): number {
  return Math.max(0, Math.min(next, hi));
}

function clampMax(next: number, lo: number, max: number): number {
  return Math.min(max, Math.max(next, lo));
}

export default function ClosedLookbackRangeSlider({
  days,
  startIndex,
  endIndex,
  onStartChange,
  onEndChange,
}: ClosedLookbackRangeSliderProps) {
  const max = Math.max(0, days.length - 1);
  const lo = clampMin(startIndex, endIndex);
  const hi = clampMax(endIndex, lo, max);
  const startDay = days[lo] ?? "";
  const endDay = days[hi] ?? "";
  const span = Math.max(1, hi - lo + 1);
  const leftPct = max === 0 ? 0 : (lo / max) * 100;
  const widthPct = max === 0 ? 100 : ((hi - lo) / max) * 100;

  return (
    <div className="rounded-2xl border border-charcoal/[0.08] bg-white px-4 py-3 lg:px-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-mono text-[11px] tracking-[0.16em] uppercase text-gold">
          Lookback
        </p>
        <p className="font-mono text-[11px] tabular-nums tracking-[0.06em] uppercase text-navy">
          {formatClosedDayLabel(startDay)}
          <span className="text-slate"> → </span>
          {formatClosedDayLabel(endDay)}
          <span className="text-slate"> · {span}d</span>
        </p>
      </div>
      <div className="relative mt-3 h-6">
        <div
          aria-hidden
          className="pointer-events-none absolute left-0 right-0 top-1/2 h-2 -translate-y-1/2 rounded-full bg-charcoal/[0.08]"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute top-1/2 h-2 -translate-y-1/2 rounded-full bg-gold/70"
          style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
        />
        <input
          type="range"
          min={0}
          max={max}
          step={1}
          value={lo}
          onChange={(e) => {
            const next = Number(e.target.value);
            if (lo === hi && next < lo) {
              onStartChange(clampMin(next, hi));
              return;
            }
            onStartChange(clampMin(next, hi));
          }}
          className="closed-lookback-range absolute inset-0 z-20 h-6 w-full cursor-pointer appearance-none bg-transparent"
          aria-label="Lookback start"
        />
        <input
          type="range"
          min={0}
          max={max}
          step={1}
          value={hi}
          onChange={(e) => {
            const next = Number(e.target.value);
            if (lo === hi && next < lo) {
              onStartChange(clampMin(next, hi));
              return;
            }
            onEndChange(clampMax(next, lo, max));
          }}
          className="closed-lookback-range absolute inset-0 z-30 h-6 w-full cursor-pointer appearance-none bg-transparent"
          aria-label="Lookback end"
        />
      </div>
    </div>
  );
}
