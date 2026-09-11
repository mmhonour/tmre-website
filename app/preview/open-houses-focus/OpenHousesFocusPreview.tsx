"use client";

import { useMemo, useState } from "react";
import { ListingCollection } from "@/app/open-houses/OpenHousesClient";
import {
  filterPillIndependentButtonClass,
  filterPillIndependentContainerClass,
} from "@/lib/filter-pill-styles";
import { openHouseListingTown } from "@/lib/open-houses-groups";
import {
  exclusiveOpenHouseFocus,
  filterOpenHouseFocus,
  openHouseFocusEmptyCopy,
} from "@/lib/open-houses-focus";
import {
  formatOpenHouseHistory,
  formatOpenHouseWeekCount,
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
const HARBOR = event("8 Harbor Rd", "2026-09-13", "10:00", "12:00");
const HARBOR_SUN = event("8 Harbor Rd", "2026-09-13", "14:00", "16:00");

const LISTINGS: OpenHouseListing[] = [
  fixture("Westport", "06880", "16 Sea Spray Rd", [SAT, SUN], SAT, {
    pastCount: 12,
    weekOpenHouseCount: 2,
    price: 2_195_000,
  }),
  fixture("Westport", "06880", "2 Main St", [MAIN], MAIN, {
    pastCount: 0,
    weekOpenHouseCount: 1,
  }),
  fixture("Wilton", "06897", "5 Locust Ln", [LOCUST], LOCUST, {
    pastCount: 3,
    weekOpenHouseCount: 1,
    price: 875_000,
  }),
  fixture("Westport", "06880", "8 Harbor Rd", [HARBOR, HARBOR_SUN], HARBOR, {
    pastCount: 5,
    weekOpenHouseCount: 2,
    price: 1_595_000,
  }),
];

export function OpenHousesFocusPreview() {
  const [most, setMost] = useState(false);
  const [first, setFirst] = useState(false);
  const focus = { most, first };
  const shown = useMemo(
    () => filterOpenHouseFocus(LISTINGS, focus, openHouseListingTown),
    [most, first],
  );

  return (
    <div className="space-y-6">
      <div
        className={filterPillIndependentContainerClass("compact")}
        role="group"
        aria-label="First showing or most open houses"
      >
        <button
          type="button"
          onClick={() => {
            const next = exclusiveOpenHouseFocus("most", !most);
            setMost(next.most);
            setFirst(next.first);
          }}
          aria-pressed={most}
          className={filterPillIndependentButtonClass(most, "compact", "light")}
        >
          Most open houses
        </button>
        <button
          type="button"
          onClick={() => {
            const next = exclusiveOpenHouseFocus("first", !first);
            setMost(next.most);
            setFirst(next.first);
          }}
          aria-pressed={first}
          className={filterPillIndependentButtonClass(first, "compact", "light")}
        >
          First showing
        </button>
      </div>

      <p className="font-mono text-[11px] text-slate">
        {shown.length} of {LISTINGS.length} fixture homes
        {shown.length === 0
          ? ` — ${openHouseFocusEmptyCopy({ focus })}`
          : ""}
      </p>

      <ul className="space-y-1 font-mono text-[10px] text-slate/70">
        {LISTINGS.map((l) => (
          <li key={l.mlsId}>
            {l.address.street}: {formatOpenHouseWeekCount(l.weekOpenHouseCount)}{" "}
            · {formatOpenHouseHistory(l.pastCount, l.upcomingCount)}
            {shown.some((s) => s.mlsId === l.mlsId) ? " · showing" : " · hidden"}
          </li>
        ))}
      </ul>

      {shown.length > 0 ? (
        <ListingCollection listings={shown} view="rows" />
      ) : null}
    </div>
  );
}
