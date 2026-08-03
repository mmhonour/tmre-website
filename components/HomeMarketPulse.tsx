"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { HomeMarketPulseTown } from "@/lib/home-market-pulse-types";
import {
  relativeStatColorStyle,
  type StatScaleDirection,
} from "@/lib/stat-scale-color";

type SortKey =
  | "medianPrice"
  | "daysOnMarket"
  | "saleToList"
  | "monthsSupply"
  | "closedThisWeekVolume"
  | "closedThisWeek";

const SORT_FIELDS: {
  key: SortKey;
  label: string;
  /** Natural first-click order for this field. */
  natural: StatScaleDirection;
}[] = [
  { key: "medianPrice", label: "Median price", natural: "asc" },
  { key: "daysOnMarket", label: "Days on market", natural: "desc" },
  { key: "saleToList", label: "Sale-to-list", natural: "asc" },
  { key: "monthsSupply", label: "Months supply", natural: "desc" },
  { key: "closedThisWeekVolume", label: "Volume closed", natural: "desc" },
  { key: "closedThisWeek", label: "Closings", natural: "desc" },
];

function formatPrice(n: number | null): string {
  if (n == null || !Number.isFinite(n)) return "—";
  if (n >= 1_000_000) {
    const m = n / 1_000_000;
    return `$${m >= 10 ? m.toFixed(1) : m.toFixed(2).replace(/\.?0+$/, "")}M`;
  }
  if (n >= 1_000) return `$${Math.round(n / 1_000)}K`;
  return `$${Math.round(n).toLocaleString()}`;
}

function formatDom(n: number | null): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return String(Math.round(n));
}

function formatPct(n: number | null): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return `${n.toFixed(1)}%`;
}

function formatMos(n: number | null): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return n.toFixed(1);
}

function formatCount(n: number | null): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return String(Math.round(n));
}

export default function HomeMarketPulse({
  towns,
}: {
  towns: HomeMarketPulseTown[];
}) {
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  /** When true, reverse the field's natural order. */
  const [sortReversed, setSortReversed] = useState(false);

  const peers = useMemo(
    () => ({
      medianPrice: towns.map((t) => t.medianPrice),
      daysOnMarket: towns.map((t) => t.daysOnMarket),
      saleToList: towns.map((t) => t.saleToList),
      monthsSupply: towns.map((t) => t.monthsSupply),
      closedThisWeekVolume: towns.map((t) => t.closedThisWeekVolume),
      closedThisWeek: towns.map((t) => t.closedThisWeek),
    }),
    [towns],
  );

  const sorted = useMemo(() => {
    if (!sortKey) return towns;
    const field = SORT_FIELDS.find((f) => f.key === sortKey);
    const naturalDesc = field?.natural === "desc";
    return [...towns].sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      const cmp = av - bv;
      const natural = naturalDesc ? -cmp : cmp;
      return sortReversed ? -natural : natural;
    });
  }, [towns, sortKey, sortReversed]);

  function onSort(key: SortKey) {
    if (sortKey === key) {
      setSortReversed((r) => !r);
      return;
    }
    setSortKey(key);
    setSortReversed(false);
  }

  function sortIndicator(key: SortKey): string {
    if (sortKey !== key) return "";
    const field = SORT_FIELDS.find((f) => f.key === key);
    const showingDesc =
      field?.natural === "desc" ? !sortReversed : sortReversed;
    return showingDesc ? " ↓" : " ↑";
  }

  return (
    <section className="bg-navy text-white relative">
      <div className="mx-auto max-w-7xl px-6 lg:px-10 -mt-20 relative z-10">
        <div className="rounded-3xl bg-gradient-to-br from-navy-light to-navy border border-white/10 shadow-2xl shadow-black/30 p-8 lg:p-12">
          <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
            <div>
              <p className="font-mono text-[11px] tracking-[0.2em] uppercase text-gold">
                Market Pulse
              </p>
              <p className="mt-2 text-sm text-white/65 max-w-xl leading-relaxed">
                Live preview of the Monday market brief — months supply, inventory,
                and Deal of the Week across every searchable town.
              </p>
            </div>
            <Link
              href="/market-pulse"
              className="inline-flex items-center gap-2 font-mono text-[11px] tracking-[0.14em] uppercase text-gold border border-gold/35 rounded-full px-4 py-2 hover:bg-gold/10 transition-colors"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-sage animate-pulse-dot" />
              Open this week&apos;s brief
            </Link>
          </div>

          <div
            className="mb-8 flex flex-wrap items-center gap-2"
            role="group"
            aria-label="Sort town stats"
          >
            <span className="font-mono text-[10px] tracking-[0.14em] uppercase text-white/45 mr-1">
              Sort by
            </span>
            {SORT_FIELDS.map((field) => {
              const active = sortKey === field.key;
              return (
                <button
                  key={field.key}
                  type="button"
                  onClick={() => onSort(field.key)}
                  className={`rounded-full border px-3 py-1.5 font-mono text-[10px] tracking-[0.12em] uppercase transition-colors ${
                    active
                      ? "border-gold/50 bg-gold/15 text-gold"
                      : "border-white/15 text-white/60 hover:border-white/30 hover:text-white"
                  }`}
                  aria-pressed={active}
                >
                  {field.label}
                  {sortIndicator(field.key)}
                </button>
              );
            })}
            {sortKey ? (
              <button
                type="button"
                onClick={() => {
                  setSortKey(null);
                  setSortReversed(false);
                }}
                className="font-mono text-[10px] tracking-[0.12em] uppercase text-white/40 hover:text-white/70 underline underline-offset-2"
              >
                Reset
              </button>
            ) : null}
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {sorted.map((town) => (
              <CityCard key={town.town} town={town} peers={peers} />
            ))}
          </div>
        </div>
      </div>
      <div className="h-24 bg-gradient-to-b from-navy to-cream" aria-hidden />
    </section>
  );
}

function CityCard({
  town,
  peers,
}: {
  town: HomeMarketPulseTown;
  peers: {
    medianPrice: (number | null)[];
    daysOnMarket: (number | null)[];
    saleToList: (number | null)[];
    monthsSupply: (number | null)[];
    closedThisWeekVolume: (number | null)[];
    closedThisWeek: (number | null)[];
  };
}) {
  const stats: {
    key: SortKey;
    label: string;
    value: string;
    trend: string;
    style: { color: string } | undefined;
  }[] = [
    {
      key: "medianPrice",
      label: "Median price",
      value: formatPrice(town.medianPrice),
      trend: town.trends.medianPrice,
      style: relativeStatColorStyle(
        town.medianPrice,
        peers.medianPrice,
        "asc",
      ),
    },
    {
      key: "daysOnMarket",
      label: "Days on market",
      value: formatDom(town.daysOnMarket),
      trend: town.trends.daysOnMarket,
      style: relativeStatColorStyle(
        town.daysOnMarket,
        peers.daysOnMarket,
        "desc",
      ),
    },
    {
      key: "saleToList",
      label: "Sale-to-list",
      value: formatPct(town.saleToList),
      trend: town.trends.saleToList,
      style: relativeStatColorStyle(town.saleToList, peers.saleToList, "asc"),
    },
    {
      key: "monthsSupply",
      label: "Months supply",
      value: formatMos(town.monthsSupply),
      trend: town.trends.monthsSupply,
      style: relativeStatColorStyle(
        town.monthsSupply,
        peers.monthsSupply,
        "desc",
      ),
    },
    {
      key: "closedThisWeekVolume",
      label: "Volume closed",
      value: formatPrice(town.closedThisWeekVolume),
      trend: town.trends.closedThisWeekVolume,
      style: relativeStatColorStyle(
        town.closedThisWeekVolume,
        peers.closedThisWeekVolume,
        "asc",
      ),
    },
    {
      key: "closedThisWeek",
      label: "Closings",
      value: formatCount(town.closedThisWeek),
      trend: town.trends.closedThisWeek,
      style: relativeStatColorStyle(
        town.closedThisWeek,
        peers.closedThisWeek,
        "asc",
      ),
    },
  ];

  return (
    <div className="rounded-2xl bg-navy-dark/60 border border-white/5 p-6 lg:p-8 transition-all hover:border-gold/30 hover:-translate-y-1">
      <h3 className="font-serif text-2xl text-white">{town.town}</h3>
      <p className="mt-1 mb-6 text-right font-mono text-[10px] tracking-[0.2em] uppercase text-gold">
        {town.tagline}
      </p>
      <div className="grid grid-cols-2 gap-5">
        {stats.map((stat) => (
          <div key={stat.key} className="border-l border-white/10 pl-4">
            <p className="font-mono text-[10px] tracking-[0.15em] uppercase text-white/50 mb-1.5">
              {stat.label}
            </p>
            <p
              className="font-mono text-2xl font-medium tabular-nums"
              style={stat.style ?? { color: "rgb(255 255 255)" }}
            >
              {stat.value}
            </p>
            <p className="text-[11px] text-white/45 mt-1">{stat.trend}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
