"use client";

import { useState } from "react";
import Link from "next/link";
import DealBoardMap, {
  type DealBoardMapListing,
} from "@/components/intelligence/DealBoardMap";

const SUBJECT_KEY = "preview-subject";

const FIXTURES: DealBoardMapListing[] = [
  {
    key: SUBJECT_KEY,
    address: "118 Lloyd Drive",
    city: "Fairfield",
    price: 759000,
    score: 64,
    isRental: false,
    beds: 3,
    baths: 2,
    sqft: 1736,
    latitude: 41.202043,
    longitude: -73.248382,
    photoCount: 0,
  },
  {
    key: "preview-comp-a",
    address: "12 Adley Road",
    city: "Fairfield",
    price: 689000,
    score: 58,
    isRental: false,
    beds: 3,
    baths: 2,
    sqft: 1480,
    latitude: 41.2042,
    longitude: -73.2501,
    photoCount: 0,
  },
  {
    key: "preview-comp-b",
    address: "40 Davis Street",
    city: "Fairfield",
    price: 825000,
    score: 71,
    isRental: false,
    beds: 4,
    baths: 2.5,
    sqft: 2100,
    latitude: 41.1998,
    longitude: -73.2464,
    photoCount: 0,
  },
  {
    key: "preview-comp-c",
    address: "88 Mohegan Road",
    city: "Fairfield",
    price: 915000,
    score: 69,
    isRental: false,
    beds: 4,
    baths: 3,
    sqft: 2400,
    latitude: 41.2061,
    longitude: -73.2448,
    photoCount: 0,
  },
];

/**
 * Isolated map for pin-card switch + zip-perspective camera.
 * Fixtures only — no listing API.
 */
export default function MapPinsPreviewClient() {
  const [activeKey, setActiveKey] = useState<string | null>(null);

  return (
    <div className="flex min-h-screen flex-col bg-navy">
      <div className="shrink-0 px-4 py-3 text-white">
        <Link
          href="/preview"
          className="font-mono text-[10px] uppercase tracking-[0.16em] text-white/60 hover:text-gold"
        >
          ← UI previews
        </Link>
        <h1 className="mt-2 font-serif text-2xl">Map pins and zip perspective</h1>
        <p className="mt-1 max-w-2xl text-sm leading-relaxed text-white/70">
          Tap a price pin. The thumbnail card must move to that home — the
          previous card must close. The house (sky pin) stays centered in 06825;
          other Fairfield zips still draw. Reset view is the town.
        </p>
        <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.14em] text-gold">
          Active pin: {activeKey ?? "none"}
        </p>
      </div>
      <div className="min-h-0 flex-1 px-3 pb-3">
        <DealBoardMap
          listings={FIXTURES}
          subjectKey={SUBJECT_KEY}
          boundZips={["06824", "06825", "06890"]}
          fitZips={["06825"]}
          highlightZip="06825"
          activeKey={activeKey}
          onSelect={setActiveKey}
          className="h-full"
          heightClass="h-[min(70vh,36rem)]"
        />
      </div>
    </div>
  );
}
