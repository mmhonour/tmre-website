"use client";

import { useMemo, useState } from "react";
import { OpenHouseTownSection } from "@/components/OpenHouseTownSection";
import { groupOpenHousesByTownAndDay } from "@/lib/open-houses-groups";
import { formatOpenHouseWhen, type OpenHouseEvent, type OpenHouseListing } from "@/lib/open-houses";
import { TMRE_TOWNS, TOWN_ZIPS } from "@/lib/tmre-towns";

const TODAY = "2026-09-12";

const FIXTURES: { town: (typeof TMRE_TOWNS)[number]; street: string }[] = [
  { town: "Norwalk", street: "71 Silvermine Avenue" },
  { town: "New Canaan", street: "176 Forest Street" },
  { town: "Westport", street: "124 Harvest Commons" },
  { town: "Wilton", street: "35 Glen Ridge" },
  { town: "Weston", street: "261 Newtown Turnpike" },
  { town: "Fairfield", street: "211 Hunyadi Avenue" },
  { town: "Ridgefield", street: "138 Shadow Lake Road" },
];

function event(street: string): OpenHouseEvent {
  return {
    id: `${street}-${TODAY}`,
    listingKey: street,
    listingId: street,
    date: TODAY,
    startDateTime: `${TODAY}T11:00:00`,
    endDateTime: `${TODAY}T13:00:00`,
    type: "Public",
    comment: null,
  };
}

function listing(town: (typeof TMRE_TOWNS)[number], street: string): OpenHouseListing {
  const next = event(street);
  const zip = TOWN_ZIPS[town][0];
  return {
    mlsId: street,
    propertyType: "Single Family For Sale",
    style: "Colonial",
    address: {
      street,
      unit: "",
      city: town,
      state: "CT",
      postalCode: zip,
      full: `${street}, ${town}, CT ${zip}`,
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
    openHouses: [next],
    nextOpenHouse: next,
    pastCount: 0,
    upcomingCount: 1,
    weekOpenHouseCount: 1,
  };
}

export function OpenHousesOnePerTownPreview() {
  const [openTowns, setOpenTowns] = useState<Set<string>>(() => new Set());
  const groups = useMemo(
    () =>
      groupOpenHousesByTownAndDay(
        FIXTURES.map((row) => listing(row.town, row.street)),
        { today: TODAY, townOrder: TMRE_TOWNS },
      ),
    [],
  );
  const allOpen = groups.length > 0 && groups.every((group) => openTowns.has(group.town));

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <span className="font-mono text-xs text-slate">
          {groups.length} homes · 1 per town
        </span>
        <button
          type="button"
          aria-pressed={allOpen}
          onClick={() =>
            setOpenTowns(allOpen ? new Set() : new Set(groups.map((group) => group.town)))
          }
          className="inline-flex items-center rounded-full border border-charcoal/[0.08] bg-white px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-navy"
        >
          {allOpen ? "Close all towns" : "Expand all towns"}
        </button>
      </div>
      <div className="space-y-3">
        {groups.map((group) => (
          <OpenHouseTownSection
            key={group.town}
            town={group.town}
            propertyCount={group.propertyCount}
            open={openTowns.has(group.town)}
            onOpenChange={(next) =>
              setOpenTowns((current) => {
                const copy = new Set(current);
                if (next) copy.add(group.town);
                else copy.delete(group.town);
                return copy;
              })
            }
          >
            <ul className="space-y-2">
              {group.days.flatMap((day) =>
                day.listings.map((row) => (
                  <li
                    key={row.mlsId}
                    className="rounded-xl border border-charcoal/[0.08] bg-white px-4 py-3"
                  >
                    <p className="text-sm font-medium text-navy">{row.address.street}</p>
                    <p className="mt-1 font-mono text-[11px] text-slate">
                      {formatOpenHouseWhen(row.nextOpenHouse)}
                    </p>
                  </li>
                )),
              )}
            </ul>
          </OpenHouseTownSection>
        ))}
      </div>
    </div>
  );
}
