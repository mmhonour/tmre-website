"use client";

import { useState } from "react";
import { ListingCollection } from "@/app/open-houses/OpenHousesClient";
import DealBoardViewPicker from "@/components/intelligence/deal-board/DealBoardViewPicker";
import {
  DEAL_BOARD_VIEW_LABELS,
  type DealBoardCardView,
} from "@/lib/deal-board-view";
import type { OpenHouseEvent, OpenHouseListing } from "@/lib/open-houses";

function event(
  street: string,
  date: string,
  start = "11:00",
  end = "13:00",
): OpenHouseEvent {
  return {
    id: `${street}-${date}-${start}`,
    listingKey: street,
    listingId: street,
    date,
    startDateTime: `${date}T${start}:00`,
    endDateTime: `${date}T${end}:00`,
    type: "Public",
    comment: null,
  };
}

function fixture(
  city: string,
  zip: string,
  street: string,
  next: OpenHouseEvent,
  extra?: Partial<OpenHouseListing>,
): OpenHouseListing {
  return {
    mlsId: street,
    propertyType: "Single Family For Sale",
    style: "Colonial",
    address: {
      street,
      unit: "",
      city,
      state: "CT",
      postalCode: zip,
      full: `${street}, ${city}, CT ${zip}`,
    },
    price: 1_250_000,
    beds: 4,
    baths: 3,
    sqft: 2800,
    yearBuilt: 1960,
    dom: 4,
    photoCount: 0,
    status: "Active",
    ownerName: "Jane Owner",
    openHouses: [next],
    nextOpenHouse: next,
    pastCount: 1,
    upcomingCount: 1,
    weekOpenHouseCount: 1,
    ...extra,
  };
}

const MAIN = event("2 Main St", "2026-09-12");
const SEA = event("16 Sea Spray Rd", "2026-09-12", "12:00", "14:00");
const LOCUST = event("5 Locust Ln", "2026-09-13");
const HARBOR = event("8 Harbor Rd", "2026-09-13", "10:00", "12:00");

const LISTINGS: OpenHouseListing[] = [
  fixture("Westport", "06880", "2 Main St", MAIN),
  fixture("Westport", "06880", "16 Sea Spray Rd", SEA, {
    price: 2_195_000,
    beds: 5,
    baths: 4,
  }),
  fixture("Wilton", "06897", "5 Locust Ln", LOCUST, { price: 875_000 }),
  fixture("Westport", "06880", "8 Harbor Rd", HARBOR, { price: 1_595_000 }),
];

export function OpenHousesViewGlyphsPreview() {
  const [view, setView] = useState<DealBoardCardView>("grid");

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-charcoal/[0.08] bg-white px-4 py-3">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-slate">
            Same picker as Intelligence
          </p>
          <p className="mt-1 font-serif text-2xl text-navy">
            {DEAL_BOARD_VIEW_LABELS[view]}
          </p>
        </div>
        <DealBoardViewPicker view={view} onChange={setView} />
      </div>

      <ListingCollection listings={LISTINGS} view={view} />
    </div>
  );
}
