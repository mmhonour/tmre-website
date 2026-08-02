"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import WeeklyBriefContent from "@/components/WeeklyBriefContent";
import { useMarketPulseSettle } from "@/hooks/useMarketPulseSettle";
import type {
  MarketDigestClosedTownCount,
  MarketDigestSnapshot,
} from "@/lib/market-digest-types";
import {
  MARKET_PULSE_CATEGORY_IDS,
  marketPulseTownAvgDomStatsHref,
  marketPulseTownClosedSalesStatsHref,
  marketPulseTownIntelligenceHref,
  marketPulseTownMonthsSupplyStatsHref,
  type MarketPulseCategoryId,
} from "@/lib/market-pulse-shared";
import {
  filterPillButtonClass,
  filterPillContainerClass,
} from "@/lib/filter-pill-styles";

const TAB_ORDER = MARKET_PULSE_CATEGORY_IDS;

/** Closed-by-town query params per tab (mirrors the digest category specs). */
const CLOSED_QUERY: Record<MarketPulseCategoryId, string> = {
  all: "kind=sale&property=all",
  sfr: "kind=sale&property=homes",
  condo: "kind=sale&property=condos",
  rentals: "kind=rental&property=all",
  commercial: "commercial=1",
};

export default function MarketPulseContent({
  snapshot,
  etDate,
}: {
  snapshot: MarketDigestSnapshot;
  etDate: string;
}) {
  const [categoryId, setCategoryId] = useState<MarketPulseCategoryId>("all");
  /** Property types that have already played their settle animation. */
  const [animatedCategories, setAnimatedCategories] = useState(
    () => new Set<MarketPulseCategoryId>(),
  );

  const categories = useMemo(() => {
    const byId = new Map(snapshot.categories.map((c) => [c.id, c]));
    return TAB_ORDER.map((id) => byId.get(id)).filter(
      (c): c is NonNullable<typeof c> => c != null,
    );
  }, [snapshot.categories]);

  const categoryIds = useMemo(
    () => categories.map((c) => c.id),
    [categories],
  );

  const active =
    categories.find((c) => c.id === categoryId) ?? categories[0] ?? null;
  const category = active?.id ?? "all";

  const allTypesAnimated =
    categoryIds.length > 0 &&
    categoryIds.every((id) => animatedCategories.has(id));
  const shouldAnimate =
    !allTypesAnimated && !animatedCategories.has(category);

  const markAnimated = useCallback((id: MarketPulseCategoryId) => {
    setAnimatedCategories((prev) => {
      if (prev.has(id)) return prev;
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  }, []);

  const settle = useMarketPulseSettle(shouldAnimate, category, () => {
    markAnimated(category);
  });

  // Two-year closed aggregate is fetched per tab: running it for five property
  // classes during SSR is what used to time the page out on Netlify.
  const [closedByCategory, setClosedByCategory] = useState<
    Partial<Record<MarketPulseCategoryId, MarketDigestClosedTownCount[]>>
  >(() => {
    const seeded: Partial<
      Record<MarketPulseCategoryId, MarketDigestClosedTownCount[]>
    > = {};
    for (const cat of snapshot.categories) {
      if (cat.closedTrailing?.length) seeded[cat.id] = cat.closedTrailing;
    }
    return seeded;
  });

  useEffect(() => {
    if (closedByCategory[category]) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(
          `/api/market-pulse/closed-by-town?${CLOSED_QUERY[category]}`,
          { cache: "no-store" },
        );
        if (!res.ok) return;
        const body = (await res.json()) as {
          rows?: MarketDigestClosedTownCount[];
        };
        if (cancelled || !Array.isArray(body.rows)) return;
        setClosedByCategory((prev) => ({ ...prev, [category]: body.rows }));
      } catch {
        /* leave the chart on its empty state */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [category, closedByCategory]);

  const viewSnapshot: MarketDigestSnapshot = active
    ? {
        ...snapshot,
        market: active.market,
        westport: active.westport,
        towns: active.towns,
        closedTrailing: closedByCategory[category] ?? [],
        avgDomByTown: active.avgDomByTown ?? [],
        dealOfTheWeek: active.deal ?? null,
      }
    : snapshot;

  const townHref = (cityLabel: string) =>
    marketPulseTownIntelligenceHref(cityLabel, category);
  const monthsSupplyTownHref = (cityLabel: string) =>
    marketPulseTownMonthsSupplyStatsHref(cityLabel, category);
  const closedSalesTownHref = (cityLabel: string) =>
    marketPulseTownClosedSalesStatsHref(cityLabel, category);
  const avgDomTownHref = (cityLabel: string) =>
    marketPulseTownAvgDomStatsHref(cityLabel, category);

  return (
    <div className="mx-auto max-w-2xl">
      <div
        className={`${filterPillContainerClass("compact", {
          wrap: true,
          bordered: true,
          theme: "light",
        })} mb-4 w-full justify-start sm:justify-center`}
        role="tablist"
        aria-label="Market Pulse categories"
      >
        {categories.map((cat) => {
          const selected = active?.id === cat.id;
          return (
            <button
              key={cat.id}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => setCategoryId(cat.id)}
              className={filterPillButtonClass(selected, "compact", "light")}
            >
              {cat.label}
            </button>
          );
        })}
      </div>

      <WeeklyBriefContent
        snapshot={viewSnapshot}
        etDate={etDate}
        scopeLabel={active?.scopeLabel ?? "sales"}
        selectionLabel={active?.selectionLabel ?? active?.scopeLabel ?? "sales"}
        showDealOfTheWeek
        dealHeading={
          active?.id === "all" ? "Deal of the Week" : "Featured deal"
        }
        townHref={townHref}
        monthsSupplyTownHref={monthsSupplyTownHref}
        closedSalesTownHref={closedSalesTownHref}
        avgDomTownHref={avgDomTownHref}
        settle={settle}
      />
    </div>
  );
}
