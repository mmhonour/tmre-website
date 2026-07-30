"use client";

import { useMemo, useState } from "react";
import WeeklyBriefContent from "@/components/WeeklyBriefContent";
import type { MarketDigestSnapshot } from "@/lib/market-digest-types";
import {
  MARKET_PULSE_CATEGORY_IDS,
  marketPulseTownIntelligenceHref,
  marketPulseTownMonthsSupplyStatsHref,
  type MarketPulseCategoryId,
} from "@/lib/market-pulse-shared";
import {
  filterPillButtonClass,
  filterPillContainerClass,
} from "@/lib/filter-pill-styles";

const TAB_ORDER = MARKET_PULSE_CATEGORY_IDS;

export default function MarketPulseContent({
  snapshot,
  etDate,
}: {
  snapshot: MarketDigestSnapshot;
  etDate: string;
}) {
  const [categoryId, setCategoryId] = useState<MarketPulseCategoryId>("all");

  const categories = useMemo(() => {
    const byId = new Map(snapshot.categories.map((c) => [c.id, c]));
    return TAB_ORDER.map((id) => byId.get(id)).filter(
      (c): c is NonNullable<typeof c> => c != null,
    );
  }, [snapshot.categories]);

  const active =
    categories.find((c) => c.id === categoryId) ?? categories[0] ?? null;

  const viewSnapshot: MarketDigestSnapshot = active
    ? {
        ...snapshot,
        market: active.market,
        westport: active.westport,
        towns: active.towns,
        dealOfTheWeek: active.deal ?? null,
      }
    : snapshot;

  const category = active?.id ?? "all";
  const townHref = (cityLabel: string) =>
    marketPulseTownIntelligenceHref(cityLabel, category);
  const monthsSupplyTownHref = (cityLabel: string) =>
    marketPulseTownMonthsSupplyStatsHref(cityLabel, category);

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
        showDealOfTheWeek
        dealHeading={
          active?.id === "all" ? "Deal of the Week" : "Featured deal"
        }
        townHref={townHref}
        monthsSupplyTownHref={monthsSupplyTownHref}
      />
    </div>
  );
}
