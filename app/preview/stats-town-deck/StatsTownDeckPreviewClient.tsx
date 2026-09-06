"use client";

import { useState } from "react";
import Link from "next/link";
import StatsTownDeck, {
  type TownDeckStats,
  type TownDeckVintage,
} from "@/app/stats/StatsTownDeck";
import { TOWN_LIST, type StatsCity, type Town } from "@/app/stats/stats-towns";

const FIXTURE_STATS: Record<Town, TownDeckStats> = {
  Norwalk: {
    city: "Norwalk",
    activeCount: 142,
    medianPrice: 725_000,
    avgDaysOnMarket: 18,
    avgPricePerSqft: 412,
    avgBeds: 3.2,
  },
  "New Canaan": {
    city: "New Canaan",
    activeCount: 61,
    medianPrice: 1_850_000,
    avgDaysOnMarket: 29,
    avgPricePerSqft: 598,
    avgBeds: 4.1,
  },
  Westport: {
    city: "Westport",
    activeCount: 88,
    medianPrice: 2_150_000,
    avgDaysOnMarket: 22,
    avgPricePerSqft: 641,
    avgBeds: 4.4,
  },
  Wilton: {
    city: "Wilton",
    activeCount: 54,
    medianPrice: 1_275_000,
    avgDaysOnMarket: 31,
    avgPricePerSqft: 387,
    avgBeds: 3.8,
  },
  Weston: {
    city: "Weston",
    activeCount: 29,
    medianPrice: 1_420_000,
    avgDaysOnMarket: 41,
    avgPricePerSqft: 356,
    avgBeds: 4.0,
  },
  Fairfield: {
    city: "Fairfield",
    activeCount: 119,
    medianPrice: 895_000,
    avgDaysOnMarket: 16,
    avgPricePerSqft: 428,
    avgBeds: 3.5,
  },
  Ridgefield: {
    city: "Ridgefield",
    activeCount: 47,
    medianPrice: 1_110_000,
    avgDaysOnMarket: 27,
    avgPricePerSqft: 401,
    avgBeds: 3.7,
  },
};

const FIXTURE_VINTAGE: Record<Town, TownDeckVintage> = {
  Norwalk: { label: "1950s", count: 38, share: 0.27 },
  "New Canaan": { label: "1960s", count: 14, share: 0.23 },
  Westport: { label: "1970s", count: 19, share: 0.22 },
  Wilton: { label: "1980s", count: 12, share: 0.22 },
  Weston: { label: "1970s", count: 8, share: 0.28 },
  Fairfield: { label: "1940s", count: 31, share: 0.26 },
  Ridgefield: { label: "1960s", count: 11, share: 0.23 },
};

const CITY_OPTIONS: StatsCity[] = ["All", ...TOWN_LIST];

export default function StatsTownDeckPreviewClient() {
  const [selectedCity, setSelectedCity] = useState<StatsCity>("All");
  const [lastMedian, setLastMedian] = useState<Town | null>(null);

  return (
    <div className="min-h-screen bg-cream">
      <div className="mx-auto max-w-7xl px-6 py-8 lg:px-10">
        <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.2em] text-gold">
          UI preview
        </p>
        <h1 className="font-serif text-3xl text-navy">Stats town snapshot deck</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate">
          Town cards no longer try to follow chart scroll. Open several, scroll
          the rail, drag one over another to stack two towns. Fixture numbers —
          no listings database.
        </p>
        <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.14em] text-slate/70">
          <Link href="/preview" className="underline decoration-gold/40 underline-offset-2">
            All previews
          </Link>
          {" · "}
          <Link href="/stats" className="underline decoration-gold/40 underline-offset-2">
            Live /stats
          </Link>
        </p>

        <div className="mt-6 flex flex-wrap items-center gap-2">
          <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-slate">
            Filter (opens that card)
          </span>
          {CITY_OPTIONS.map((city) => (
            <button
              key={city}
              type="button"
              onClick={() => setSelectedCity(city)}
              className={`rounded-full px-3 py-1 font-mono text-[10px] uppercase tracking-[0.12em] ${
                selectedCity === city
                  ? "bg-navy text-cream"
                  : "bg-white text-navy ring-1 ring-charcoal/15"
              }`}
            >
              {city === "All" ? "All Towns" : city}
            </button>
          ))}
        </div>
        {lastMedian ? (
          <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.12em] text-gold">
            Median click: {lastMedian}
          </p>
        ) : null}

        <div className="mt-8 grid items-start gap-6 lg:grid-cols-[1fr_288px]">
          <div className="space-y-6">
            {["Active by month", "Sales trend", "Months of supply", "TRAN$ACT to LIST"].map(
              (title) => (
                <div
                  key={title}
                  className="rounded-2xl border border-charcoal/[0.08] bg-white px-5 py-16"
                >
                  <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-slate">
                    Placeholder chart
                  </p>
                  <p className="mt-2 font-serif text-xl text-navy">{title}</p>
                  <p className="mt-2 text-sm text-slate">
                    Tall stand-in so the deck must scroll on its own instead of
                    tracking this column.
                  </p>
                </div>
              ),
            )}
          </div>
          <aside className="mb-10 lg:sticky lg:top-24 lg:mb-0 lg:self-start">
            <StatsTownDeck
              stats={FIXTURE_STATS}
              topVintageByTown={FIXTURE_VINTAGE}
              loading={false}
              vintageLoading={false}
              kind="sale"
              selectedCity={selectedCity}
              onMedianClick={setLastMedian}
            />
          </aside>
        </div>
      </div>
    </div>
  );
}
