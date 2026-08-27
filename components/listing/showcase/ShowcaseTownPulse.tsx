"use client";

import { useEffect, useMemo, useState } from "react";
import type { MarketPulseTownPayload } from "@/app/api/market-pulse/town/route";
import type { ListingPropertyClass } from "@/lib/listing-property-class";
import { marketPulseStackedMetrics } from "@/lib/market-pulse-stacked-metrics";
import { loadTabJson } from "@/lib/tab-data-prefetch";

/** Mirrors the Market Pulse category tabs, minus the ones with no town slice. */
const PROPERTY_TABS: { id: ListingPropertyClass; label: string }[] = [
  { id: "all", label: "All" },
  { id: "homes", label: "Homes" },
  { id: "condos", label: "Condos" },
  { id: "multi", label: "Multi" },
];

const METRIC_MAX_KEY = {
  inventory: "activeCount",
  monthsSupply: "monthsSupply",
  avgDom: "avgDaysOnMarket",
  closed: "closedCount",
  medianPrice: "medianPrice",
  priceDelta: "priceDelta",
  averagePrice: "averagePrice",
} as const;

/**
 * Buyer ↔ seller spectrum. The score is a peer rank in [0,1] computed server
 * side; this is only the readout, since Market Pulse has never had a visual
 * for it — just a sort toggle.
 */
function FavorabilityBar({ score }: { score: number | null }) {
  const pct = score == null ? null : Math.min(100, Math.max(0, score * 100));
  return (
    <div>
      <div className="flex items-baseline justify-between font-mono text-[9px] uppercase tracking-[0.16em] text-white/45">
        <span>Seller</span>
        <span className="text-white/70">
          {pct == null ? "No signal" : pct >= 55 ? "Buyer leaning" : pct <= 45 ? "Seller leaning" : "Balanced"}
        </span>
        <span>Buyer</span>
      </div>
      <div className="relative mt-1.5 h-2 w-full rounded-full bg-gradient-to-r from-coral via-gold to-sage">
        {pct != null ? (
          <span
            className="absolute top-1/2 h-4 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow-[0_0_0_2px_rgba(13,20,36,0.9)]"
            style={{ left: `${pct}%` }}
            aria-hidden
          />
        ) : null}
      </div>
    </div>
  );
}

function MetricRow({
  label,
  value,
  fill,
}: {
  label: string;
  value: string;
  fill: number;
}) {
  return (
    <div className="grid grid-cols-[6.5rem_1fr_auto] items-center gap-2 py-1">
      <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-white/45">
        {label}
      </span>
      <span className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
        <span
          className="block h-full rounded-full bg-gold/70"
          style={{ width: `${Math.min(100, Math.max(0, fill * 100))}%` }}
        />
      </span>
      <span className="text-right font-mono text-[11px] tabular-nums text-white/90">
        {value}
      </span>
    </div>
  );
}

/**
 * The town's Market Pulse slice, stacked, scoped to this listing's town.
 * Reads one endpoint so the peer ranking and aggregation stay server-side.
 */
export default function ShowcaseTownPulse({
  city,
  expanded,
}: {
  city: string;
  /** Property-type breakdown only appears once the tile is opened wide. */
  expanded: boolean;
}) {
  const [propertyClass, setPropertyClass] = useState<ListingPropertyClass>("all");
  const [data, setData] = useState<MarketPulseTownPayload | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!city) return;
    let cancelled = false;
    const params = new URLSearchParams({
      city,
      kind: "sale",
      property: propertyClass,
    });
    void loadTabJson<MarketPulseTownPayload>(
      `/api/market-pulse/town?${params.toString()}`,
    )
      .then((d) => {
        if (cancelled) return;
        setFailed(d == null);
        if (d) setData(d);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [city, propertyClass]);

  // Derived rather than an effect-set flag: a class switch is pending until the
  // payload we hold matches the class that is selected.
  const pending = !failed && data?.propertyClass !== propertyClass;

  const metrics = useMemo(
    () => marketPulseStackedMetrics(data?.closedLookbackLabel ?? "12 mos"),
    [data?.closedLookbackLabel],
  );

  if (pending && !data) {
    return (
      <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-white/45">
        Loading {city} pulse…
      </p>
    );
  }

  if (failed || !data?.row) {
    return (
      <p className="text-sm text-white/50">
        No market pulse for {city || "this town"} yet.
      </p>
    );
  }

  const row = data.row;

  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between gap-3">
        <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-gold">
          {row.city}
        </p>
        <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-white/40">
          vs {data.peerCount} towns
        </p>
      </div>

      <FavorabilityBar score={data.buyerFriendly} />

      {expanded ? (
        <div role="tablist" aria-label="Property type" className="flex flex-wrap gap-1">
          {PROPERTY_TABS.map((tab) => {
            const on = tab.id === propertyClass;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={on}
                onClick={() => setPropertyClass(tab.id)}
                className={`px-2 py-1 font-mono text-[9px] uppercase tracking-[0.14em] transition-colors ${
                  on ? "bg-white/15 text-white" : "text-white/45 hover:text-white"
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      ) : null}

      <div
        className={`divide-y divide-white/[0.06] border-t border-white/[0.06] transition-opacity ${
          pending ? "opacity-40" : ""
        }`}
      >
        {metrics.map((metric) => {
          const max = data.maxima[METRIC_MAX_KEY[metric.id]];
          const value = metric.barValueOf(row);
          const fill = max > 0 && value != null ? Math.abs(value) / max : 0;
          return (
            <MetricRow
              key={metric.id}
              label={metric.labelOf ? metric.labelOf(row) : metric.label}
              value={metric.format(row)}
              fill={fill}
            />
          );
        })}
      </div>
    </div>
  );
}
