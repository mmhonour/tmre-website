"use client";

import type { StatsValueCalc } from "@/lib/stats-compute";

/** Shared Recharts tooltip chrome for cached stats_cache calc explanations. */
export function StatsCalcTooltipShell({
  label,
  valueLine,
  calc,
}: {
  label: string;
  valueLine: string;
  calc?: StatsValueCalc | null;
}) {
  return (
    <div
      className="rounded-xl border border-white/12 bg-[#1a1f35] px-3 py-2.5 shadow-[0_20px_40px_rgba(0,0,0,0.4)]"
      style={{ maxWidth: 280 }}
    >
      <p className="font-mono text-[10px] tracking-[0.15em] uppercase text-gold">
        {label}
      </p>
      <p className="mt-1 font-mono text-[11px] text-white">{valueLine}</p>
      {calc?.summary ? (
        <p className="mt-2 font-mono text-[10px] leading-relaxed text-white/55">
          {calc.summary}
        </p>
      ) : null}
      {calc?.detail?.length ? (
        <ul className="mt-1.5 space-y-1">
          {calc.detail.map((line) => (
            <li
              key={line}
              className="font-mono text-[9px] leading-relaxed text-white/35"
            >
              {line}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
