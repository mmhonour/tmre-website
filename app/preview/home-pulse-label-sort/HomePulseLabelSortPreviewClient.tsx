"use client";

import Link from "next/link";
import HomeMarketPulse from "@/components/HomeMarketPulse";
import type { HomeMarketPulseTown } from "@/lib/home-market-pulse-types";

const FIXTURE_TOWNS: HomeMarketPulseTown[] = [
  {
    town: "Westport",
    tagline: "Gold coast",
    medianPrice: 2_150_000,
    daysOnMarket: 18,
    saleToList: 101.4,
    monthsSupply: 1.8,
    closedLast4Weeks: 22,
    closedLast4WeeksVolume: 48_200_000,
    trends: {
      medianPrice: "+4% YoY",
      daysOnMarket: "−2 vs LY",
      saleToList: "Above ask",
      monthsSupply: "Tight",
      closedLast4Weeks: "Past 4 weeks",
      closedLast4WeeksVolume: "Sum of close prices · 4w",
    },
  },
  {
    town: "Norwalk",
    tagline: "Harbor city",
    medianPrice: 725_000,
    daysOnMarket: 24,
    saleToList: 99.1,
    monthsSupply: 2.9,
    closedLast4Weeks: 41,
    closedLast4WeeksVolume: 29_400_000,
    trends: {
      medianPrice: "+3% YoY",
      daysOnMarket: "Steady",
      saleToList: "At ask",
      monthsSupply: "Moderate",
      closedLast4Weeks: "Past 4 weeks",
      closedLast4WeeksVolume: "Sum of close prices · 4w",
    },
  },
  {
    town: "Wilton",
    tagline: "Ridge line",
    medianPrice: 1_275_000,
    daysOnMarket: 31,
    saleToList: 98.6,
    monthsSupply: 3.4,
    closedLast4Weeks: 9,
    closedLast4WeeksVolume: 11_800_000,
    trends: {
      medianPrice: "+2% YoY",
      daysOnMarket: "+4 vs LY",
      saleToList: "Under ask",
      monthsSupply: "Looser",
      closedLast4Weeks: "Past 4 weeks",
      closedLast4WeeksVolume: "Sum of close prices · 4w",
    },
  },
];

export default function HomePulseLabelSortPreviewClient() {
  return (
    <div className="min-h-screen bg-navy pb-16 pt-28">
      <div className="mx-auto max-w-3xl px-6 mb-8">
        <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-gold">
          UI preview
        </p>
        <h1 className="mt-2 font-serif text-3xl text-white">
          Home pulse label sort
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-white/65">
          Click a metric label on any town card to sort the deck. First click is
          descending; the arrow sits to the left of that label. The number on
          Volume closed still opens Stats with the Volume toggle on the sales
          chart. Fixture towns — not live inventory.
        </p>
        <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.14em] text-white/40">
          <Link href="/preview" className="hover:text-gold">
            All previews
          </Link>
          {" · "}
          <Link
            href="/stats?city=Westport&kind=sale&chart=sales-trend&metric=volume"
            className="hover:text-gold"
          >
            Stats volume toggle
          </Link>
        </p>
      </div>
      <HomeMarketPulse towns={FIXTURE_TOWNS} />
    </div>
  );
}
