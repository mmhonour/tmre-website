"use client";

import { OpenHouseTownSection } from "@/components/OpenHouseTownSection";
import { groupOpenHousesByTownAndDay } from "@/lib/open-houses-groups";
import {
  formatOpenHouseWeekCount,
  formatOpenHouseWhen,
  type OpenHouseEvent,
  type OpenHouseListing,
} from "@/lib/open-houses";

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
    price: 1250000,
    beds: 4,
    baths: 3,
    sqft: 2800,
    yearBuilt: 1960,
    dom: 4,
    photoCount: 0,
    status: "Active",
    ownerName: null,
    openHouses: events,
    nextOpenHouse: next,
    pastCount: 1,
    upcomingCount: events.length,
    weekOpenHouseCount: events.length,
  };
}

const TODAY = "2026-09-10";
const SEA_SPRAY = [
  event("16 Sea Spray Rd", "2026-09-10", "11:00", "13:00"),
  event("16 Sea Spray Rd", "2026-09-12", "12:00", "14:00"),
  event("16 Sea Spray Rd", "2026-09-13", "13:00", "15:00"),
];
const MAIN = event("2 Main St", "2026-09-12");
const LOCUST = event("5 Locust Ln", "2026-09-10");

const GROUPS = groupOpenHousesByTownAndDay(
  [
    fixture("Westport", "06880", "2 Main St", [MAIN], MAIN),
    fixture("Westport", "06880", "16 Sea Spray Rd", SEA_SPRAY, SEA_SPRAY[0]!),
    fixture("Wilton", "06897", "5 Locust Ln", [LOCUST], LOCUST),
  ],
  { today: TODAY, townOrder: ["Westport", "Wilton"] },
);

export function OpenHousesTownDayPreview() {
  return (
    <div className="space-y-10">
      {GROUPS.map((town) => (
        <OpenHouseTownSection
          key={town.town}
          town={town.town}
          propertyCount={town.propertyCount}
        >
          <div className="space-y-4">
            {town.days.map((day) => (
              <div key={day.date}>
                <p className="mb-2 font-mono text-[11px] tracking-[0.14em] uppercase text-slate">
                  {day.label}
                </p>
                <ul className="space-y-3">
                  {day.listings.map((listing) => (
                    <li
                      key={listing.mlsId}
                      className="rounded-xl border border-charcoal/[0.08] bg-white px-4 py-3"
                    >
                      <p className="text-sm font-medium text-navy">
                        {listing.address.street}
                      </p>
                      <p className="mt-1 font-mono text-xs tabular-nums text-navy">
                        {formatOpenHouseWeekCount(listing.weekOpenHouseCount)}
                      </p>
                      <ul className="mt-1 space-y-0.5">
                        {listing.openHouses.map((slot) => (
                          <li key={slot.id} className="font-mono text-[11px] text-slate">
                            {formatOpenHouseWhen(slot)}
                          </li>
                        ))}
                      </ul>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </OpenHouseTownSection>
      ))}
    </div>
  );
}
