"use client";

import { useEffect, useMemo, useState } from "react";
import { loadTabJson } from "@/lib/tab-data-prefetch";
import type { StatsCity, StatsKind } from "./stats-towns";

type MonthsSupplyPayload = {
  city: string;
  kind: StatsKind;
  activeCount: number;
  avgMonthlyClosings: number | null;
  monthsSupply: number | null;
};

/** Prior three full calendar months, oldest → newest (same window as the formula). */
function trailingThreeMonthLabels(now = new Date()): string[] {
  const labels: string[] = [];
  for (let offset = 3; offset >= 1; offset--) {
    const d = new Date(now.getFullYear(), now.getMonth() - offset, 1);
    labels.push(
      d.toLocaleString("en-US", { month: "short", year: "numeric" }),
    );
  }
  return labels;
}

function fmtCount(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return Number.isInteger(n) ? n.toLocaleString() : n.toFixed(1);
}

function fmtSupply(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return n.toFixed(1);
}

export default function MonthsSupplyMathExplainer({
  city,
  kind,
}: {
  city: StatsCity;
  kind: StatsKind;
}) {
  const [payload, setPayload] = useState<MonthsSupplyPayload | null>(null);
  const monthLabels = useMemo(() => trailingThreeMonthLabels(), []);
  const closingNoun = kind === "rental" ? "leases" : "closings";
  const closingNounSingular = kind === "rental" ? "lease" : "closing";
  const cityLabel = city === "All" ? "All towns" : city;

  useEffect(() => {
    let cancelled = false;
    setPayload(null);
    const params = new URLSearchParams({ city, kind, property: "all" });
    void loadTabJson<MonthsSupplyPayload>(`/api/months-supply?${params}`)
      .then((body) => {
        if (cancelled || !body) return;
        setPayload(body);
      })
      .catch(() => {
        /* keep empty — formula still shows */
      });
    return () => {
      cancelled = true;
    };
  }, [city, kind]);

  const active = payload?.activeCount ?? null;
  const avg = payload?.avgMonthlyClosings ?? null;
  const supply = payload?.monthsSupply ?? null;
  const hasLiveMath =
    active != null && avg != null && avg > 0 && supply != null;

  return (
    <aside
      className="mt-3 rounded-2xl border border-white/10 bg-[#0f1628] px-5 sm:px-6 py-5 shadow-2xl shadow-navy/20"
      aria-label="How months supply is calculated"
    >
      <p className="font-mono text-[10px] tracking-[0.2em] uppercase text-gold mb-3">
        How months supply is calculated
      </p>

      <div className="space-y-4 text-sm leading-relaxed text-white/70">
        <div className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 font-mono text-[13px] sm:text-sm text-white tracking-wide overflow-x-auto">
          <p className="whitespace-nowrap">
            <span className="text-gold">Months supply</span>
            <span className="text-white/40"> = </span>
            <span className="text-white">Active inventory</span>
            <span className="text-white/40"> ÷ </span>
            <span className="text-white">Avg monthly {closingNoun}</span>
          </p>
          <p className="mt-2 whitespace-nowrap text-white/55">
            <span className="text-white/40">Avg monthly {closingNoun}</span>
            <span className="text-white/40"> = </span>
            <span className="text-white">
              ({monthLabels.join(" + ")}) ÷ 3
            </span>
          </p>
        </div>

        {hasLiveMath ? (
          <div className="rounded-xl border border-gold/25 bg-gold/[0.06] px-4 py-3 font-mono text-[13px] sm:text-sm tracking-wide">
            <p className="text-[10px] tracking-[0.16em] uppercase text-gold/80 mb-2">
              Live math · {cityLabel} · {kind === "rental" ? "Rentals" : "For sale"}
            </p>
            <p className="text-white whitespace-nowrap overflow-x-auto">
              <span className="tabular-nums">{fmtCount(active)}</span>
              <span className="text-white/40"> ÷ </span>
              <span className="tabular-nums">{fmtCount(avg)}</span>
              <span className="text-white/40"> = </span>
              <span className="text-gold tabular-nums font-medium">
                {fmtSupply(supply)}
              </span>
              <span className="text-white/50"> months</span>
            </p>
            <p className="mt-1.5 text-[11px] text-white/45 normal-case tracking-normal font-sans">
              {fmtCount(active)} active listings ÷ {fmtCount(avg)}{" "}
              {closingNounSingular}s/month (mean of the last three full calendar
              months).
            </p>
          </div>
        ) : null}

        <ul className="space-y-2 text-[13px] sm:text-sm">
          <li>
            <span className="text-white/90 font-medium">Active inventory</span>
            <span className="text-white/45"> — </span>
            current Active {kind === "rental" ? "rentals" : "sale listings"} in{" "}
            {cityLabel} (same property-class slice as the chart).
          </li>
          <li>
            <span className="text-white/90 font-medium">
              Avg monthly {closingNoun}
            </span>
            <span className="text-white/45"> — </span>
            mean Closed count in each of the prior three full calendar months (
            {monthLabels.join(", ")}). The current month is excluded until it
            completes.
          </li>
          <li>
            <span className="text-white/90 font-medium">Reading</span>
            <span className="text-white/45"> — </span>
            lower months supply = tighter market; higher = more inventory vs.
            recent pace of {closingNoun}.
          </li>
        </ul>
      </div>
    </aside>
  );
}
