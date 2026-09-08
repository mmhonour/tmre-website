"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { HomeMarketPulseTown } from "@/lib/home-market-pulse-types";
import {
  compareHomePulseValues,
  nextHomePulseSort,
  type HomePulseSortDir,
  type HomePulseSortKey,
} from "@/lib/home-market-pulse-sort";
import { formatCompactDollars } from "@/lib/stats-compact-dollars";
import { relativeStatColorStyle } from "@/lib/stat-scale-color";
import { statsSalesTrendHref } from "@/lib/stats-url";

function formatPrice(n: number | null): string {
  return formatCompactDollars(n);
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
  const [sortKey, setSortKey] = useState<HomePulseSortKey | null>(null);
  const [sortDir, setSortDir] = useState<HomePulseSortDir>("desc");

  const peers = useMemo(
    () => ({
      medianPrice: towns.map((t) => t.medianPrice),
      daysOnMarket: towns.map((t) => t.daysOnMarket),
      saleToList: towns.map((t) => t.saleToList),
      monthsSupply: towns.map((t) => t.monthsSupply),
      closedLast4WeeksVolume: towns.map((t) => t.closedLast4WeeksVolume),
      closedLast4Weeks: towns.map((t) => t.closedLast4Weeks),
    }),
    [towns],
  );

  const sorted = useMemo(() => {
    if (!sortKey) return towns;
    return [...towns].sort((a, b) =>
      compareHomePulseValues(a[sortKey], b[sortKey], sortDir),
    );
  }, [towns, sortKey, sortDir]);

  function onSort(key: HomePulseSortKey) {
    const next = nextHomePulseSort(sortKey, sortDir, key);
    setSortKey(next.key);
    setSortDir(next.dir);
  }

  return (
    <section className="bg-navy text-white relative">
      <div className="mx-auto max-w-7xl px-6 lg:px-10 -mt-20 relative z-10">
        <div className="rounded-3xl bg-gradient-to-br from-navy-light to-navy border border-white/10 shadow-2xl shadow-black/30 p-8 lg:p-12">
          <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
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

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {sorted.map((town) => (
              <CityCard
                key={town.town}
                town={town}
                peers={peers}
                sortKey={sortKey}
                sortDir={sortDir}
                onSort={onSort}
              />
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
  sortKey,
  sortDir,
  onSort,
}: {
  town: HomeMarketPulseTown;
  peers: {
    medianPrice: (number | null)[];
    daysOnMarket: (number | null)[];
    saleToList: (number | null)[];
    monthsSupply: (number | null)[];
    closedLast4WeeksVolume: (number | null)[];
    closedLast4Weeks: (number | null)[];
  };
  sortKey: HomePulseSortKey | null;
  sortDir: HomePulseSortDir;
  onSort: (key: HomePulseSortKey) => void;
}) {
  const statsSalesHref = statsSalesTrendHref({ city: town.town });
  const statsVolumeHref = statsSalesTrendHref({
    city: town.town,
    metric: "volume",
  });
  const stats: {
    key: HomePulseSortKey;
    label: string;
    value: string;
    trend: string;
    style: { color: string } | undefined;
    href?: string;
    hrefTitle?: string;
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
      key: "closedLast4WeeksVolume",
      label: "Volume closed",
      value: formatPrice(town.closedLast4WeeksVolume),
      trend: town.trends.closedLast4WeeksVolume,
      style: relativeStatColorStyle(
        town.closedLast4WeeksVolume,
        peers.closedLast4WeeksVolume,
        "asc",
      ),
      href: statsVolumeHref,
      hrefTitle: "Volume closed by month on Stats",
    },
    {
      key: "closedLast4Weeks",
      label: "Closings",
      value: formatCount(town.closedLast4Weeks),
      trend: town.trends.closedLast4Weeks,
      style: relativeStatColorStyle(
        town.closedLast4Weeks,
        peers.closedLast4Weeks,
        "asc",
      ),
      href: statsSalesHref,
      hrefTitle: "Closed sales by month on Stats",
    },
  ];

  return (
    <div className="rounded-2xl bg-navy-dark/60 border border-white/5 p-6 lg:p-8 transition-all hover:border-gold/30 hover:-translate-y-1">
      <h3 className="font-serif text-2xl text-white">{town.town}</h3>
      <p className="mt-1 mb-6 text-right font-mono text-[10px] tracking-[0.2em] uppercase text-gold">
        {town.tagline}
      </p>
      <div className="grid grid-cols-2 gap-5">
        {stats.map((stat) => {
          const active = sortKey === stat.key;
          return (
            <div key={stat.key} className="border-l border-white/10 pl-4">
              <button
                type="button"
                onClick={() => onSort(stat.key)}
                aria-pressed={active}
                className={`mb-1.5 flex items-center gap-1.5 text-left font-mono text-[10px] tracking-[0.15em] uppercase transition-colors ${
                  active
                    ? "text-gold"
                    : "text-white/50 hover:text-white/80"
                }`}
              >
                {active ? (
                  <span aria-hidden className="w-2.5 shrink-0">
                    {sortDir === "desc" ? "↓" : "↑"}
                  </span>
                ) : (
                  <span className="w-2.5 shrink-0" aria-hidden />
                )}
                <span className="underline-offset-2 hover:underline">
                  {stat.label}
                </span>
              </button>
              {stat.href ? (
                <Link
                  href={stat.href}
                  className="font-mono text-2xl font-medium tabular-nums underline-offset-4 hover:underline"
                  style={stat.style ?? { color: "rgb(255 255 255)" }}
                  title={stat.hrefTitle}
                >
                  {stat.value}
                </Link>
              ) : (
                <p
                  className="font-mono text-2xl font-medium tabular-nums"
                  style={stat.style ?? { color: "rgb(255 255 255)" }}
                >
                  {stat.value}
                </p>
              )}
              <p className="text-[11px] text-white/45 mt-1">{stat.trend}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
