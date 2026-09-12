"use client";

import { ListingCollection } from "@/app/open-houses/OpenHousesClient";
import LatestSearchAlertForm from "@/components/latest/LatestSearchAlertForm";
import {
  formatOpenHouseWhenShort,
  type OpenHouseEvent,
  type OpenHouseListing,
} from "@/lib/open-houses";
import { normalizeVisitorSearchCriteria } from "@/lib/visitor-search-profile";

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
  events: OpenHouseEvent[],
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
    openHouses: events,
    nextOpenHouse: next,
    pastCount: 1,
    upcomingCount: events.length,
    weekOpenHouseCount: events.length,
    ...extra,
  };
}

const SAT = event("16 Sea Spray Rd", "2026-09-12", "12:00", "14:00");
const SUN = event("16 Sea Spray Rd", "2026-09-13", "13:00", "15:00");
const MAIN = event("2 Main St", "2026-09-12");
const LOCUST = event("5 Locust Ln", "2026-09-10");

const LISTINGS: OpenHouseListing[] = [
  fixture("Westport", "06880", "2 Main St", [MAIN], MAIN),
  fixture("Westport", "06880", "16 Sea Spray Rd", [SAT, SUN], SAT, {
    price: 2_195_000,
    beds: 5,
    baths: 4,
    weekOpenHouseCount: 2,
  }),
  fixture("Wilton", "06897", "5 Locust Ln", [LOCUST], LOCUST, {
    price: 875_000,
  }),
];

const FALLBACK = normalizeVisitorSearchCriteria({
  source: "intelligence",
  town: "Westport",
  tx: "sale",
  propertyClass: "residential",
  saleProperty: "homes",
  minBeds: null,
  maxBeds: null,
  minBaths: null,
  maxBaths: null,
  zip: null,
  newConstruction: null,
  boardStatus: null,
  minPrice: 800_000,
  maxPrice: 2_000_000,
});

export function OpenHousesNextOhPreview() {
  return (
    <div className="space-y-10">
      <section className="rounded-2xl border border-charcoal/[0.08] bg-white px-4 py-3">
        <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.16em] text-slate">
          Open house alerts — empty history uses town + homes + $800K–$2M
        </p>
        <LatestSearchAlertForm
          variant="open-houses"
          fallbackCriteria={FALLBACK}
          triggerId="preview-open-house-alerts"
        />
        <p className="mt-2 font-mono text-[10px] text-slate/70">
          Fallback label includes {FALLBACK.town}, {FALLBACK.saleProperty}, and
          the price band. Open the trigger to subscribe.
        </p>
      </section>

      <section>
        <h2 className="mb-2 font-mono text-[11px] uppercase tracking-[0.14em] text-slate">
          Grid — next OH upper right
        </h2>
        <p className="mb-3 text-xs text-slate">
          {formatOpenHouseWhenShort(MAIN)} on 2 Main St.
        </p>
        <ListingCollection listings={LISTINGS} view="grid" />
      </section>

      <section>
        <h2 className="mb-2 font-mono text-[11px] uppercase tracking-[0.14em] text-slate">
          Large — next OH upper right of the panel, photo matches row height
        </h2>
        <ListingCollection listings={LISTINGS} view="large" />
      </section>

      <section>
        <h2 className="mb-2 font-mono text-[11px] uppercase tracking-[0.14em] text-slate">
          Line — next OH right-aligned
        </h2>
        <ListingCollection listings={LISTINGS} view="line" />
      </section>
    </div>
  );
}
