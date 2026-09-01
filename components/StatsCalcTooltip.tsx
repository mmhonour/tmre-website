"use client";

import type { StatsValueCalc } from "@/lib/stats-compute";

/** Shared tooltip chrome for cached stats / Market Pulse calc explanations. */
export function StatsCalcTooltipShell({
  label,
  valueLine,
  calc,
  theme = "dark",
}: {
  label: string;
  valueLine: string;
  calc?: StatsValueCalc | null;
  theme?: "dark" | "light";
}) {
  const dark = theme === "dark";
  return (
    <div
      className={
        dark
          ? "rounded-xl border border-white/12 bg-[#1a1f35] px-3 py-2.5 shadow-[0_20px_40px_rgba(0,0,0,0.4)]"
          : "rounded-xl border border-black/10 bg-white px-3 py-2.5 shadow-lg shadow-black/15"
      }
      style={{ maxWidth: 280 }}
    >
      <p
        className={`font-mono text-[10px] tracking-[0.15em] uppercase ${
          dark ? "text-gold" : "text-[var(--mp-accent,#C8A951)]"
        }`}
      >
        {label}
      </p>
      <p
        className={`mt-1 font-mono text-[11px] ${
          dark ? "text-white" : "text-[var(--mp-text,#1B2A4A)]"
        }`}
      >
        {valueLine}
      </p>
      {calc?.summary ? (
        <p
          className={`mt-2 font-mono text-[10px] leading-relaxed ${
            dark ? "text-white/55" : "text-black/55"
          }`}
        >
          {calc.summary}
        </p>
      ) : (
        <p
          className={`mt-2 font-mono text-[10px] leading-relaxed ${
            dark ? "text-white/35" : "text-black/35"
          }`}
        >
          How this figure is worked out is not available for it yet.
        </p>
      )}
      {calc?.detail?.length ? (
        <ul className="mt-1.5 space-y-1">
          {calc.detail.map((line) => (
            <li
              key={line}
              className={`font-mono text-[9px] leading-relaxed ${
                dark ? "text-white/35" : "text-black/35"
              }`}
            >
              {line}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
