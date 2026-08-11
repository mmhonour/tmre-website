"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import WeeklyBriefContent from "@/components/WeeklyBriefContent";
import { useMarketPulseSettle } from "@/hooks/useMarketPulseSettle";
import type {
  MarketDigestClosedTownCount,
  MarketDigestSnapshot,
} from "@/lib/market-digest-types";
import {
  DEFAULT_MARKET_PULSE_LOOKBACK_ID,
  type MarketPulseLookbackId,
} from "@/lib/market-pulse-lookback";
import {
  MARKET_PULSE_CATEGORY_IDS,
  marketPulseTownAvgDomStatsHref,
  marketPulseTownClosedSalesStatsHref,
  marketPulseTownIntelligenceHref,
  marketPulseTownMonthsSupplyStatsHref,
  type MarketPulseCategoryId,
} from "@/lib/market-pulse-shared";
import { useTabKitSegmentedStyle } from "@/hooks/useTabKitAssignments";

const TAB_ORDER = MARKET_PULSE_CATEGORY_IDS;

/** Closed-by-town query params per tab (mirrors the digest category specs). */
const CLOSED_QUERY: Record<MarketPulseCategoryId, string> = {
  all: "kind=sale&property=all",
  sfr: "kind=sale&property=homes",
  condo: "kind=sale&property=condos",
  rentals: "kind=rental&property=all",
  commercial: "commercial=1",
};

function closedCacheKey(
  category: MarketPulseCategoryId,
  lookbackId: MarketPulseLookbackId,
): string {
  return `${category}:${lookbackId}`;
}

export default function MarketPulseContent({
  snapshot,
  etDate,
}: {
  snapshot: MarketDigestSnapshot;
  etDate: string;
}) {
  const [categoryId, setCategoryId] = useState<MarketPulseCategoryId>("all");
  const [lookbackId, setLookbackId] = useState<MarketPulseLookbackId>(
    DEFAULT_MARKET_PULSE_LOOKBACK_ID,
  );
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

  // Closed aggregate is fetched per tab × lookback. Default 24mo may be seeded
  // from the SSR snapshot; other windows hit the API (on-demand compute).
  const [closedByKey, setClosedByKey] = useState<
    Record<string, MarketDigestClosedTownCount[]>
  >(() => {
    const seeded: Record<string, MarketDigestClosedTownCount[]> = {};
    for (const cat of snapshot.categories) {
      if (cat.closedTrailing?.length) {
        seeded[closedCacheKey(cat.id, DEFAULT_MARKET_PULSE_LOOKBACK_ID)] =
          cat.closedTrailing;
      }
    }
    return seeded;
  });

  const closedKey = closedCacheKey(category, lookbackId);
  const closedRows = closedByKey[closedKey];

  useEffect(() => {
    if (closedRows) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(
          `/api/market-pulse/closed-by-town?${CLOSED_QUERY[category]}&lookback=${lookbackId}`,
          { cache: "no-store" },
        );
        if (!res.ok) return;
        const body = (await res.json()) as {
          rows?: MarketDigestClosedTownCount[];
        };
        if (cancelled || !Array.isArray(body.rows)) return;
        setClosedByKey((prev) => ({ ...prev, [closedKey]: body.rows! }));
      } catch {
        /* leave the chart on its empty state */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [category, lookbackId, closedKey, closedRows]);

  const viewSnapshot: MarketDigestSnapshot = active
    ? {
        ...snapshot,
        market: active.market,
        westport: active.westport,
        towns: active.towns,
        closedTrailing: closedRows ?? [],
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
  const tabKit = useTabKitSegmentedStyle("pill-seg-light-compact");

  const categoryFilter = (
    <div
      className={`${tabKit.containerClass({ wrap: true })} w-full justify-start`}
      role="tablist"
      aria-label="Market Pulse property type"
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
            className={tabKit.buttonClass(selected)}
          >
            {cat.label}
          </button>
        );
      })}
    </div>
  );

  return (
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
      closedPending={closedRows === undefined}
      categoryFilter={categoryFilter}
      lookbackId={lookbackId}
      onLookbackIdChange={setLookbackId}
    />
  );
}
