"use client";

import { useMemo, useState } from "react";
import { OpenHouseTownSection } from "@/components/OpenHouseTownSection";
import { useOpenHouseTownOrder } from "@/hooks/useOpenHouseTownOrder";
import { groupOpenHousesByTownAndDay } from "@/lib/open-houses-groups";
import { placeTownNextTo } from "@/lib/open-houses-town-order";
import { TMRE_TOWNS } from "@/lib/tmre-towns";
import {
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
    openHouses: [next],
    nextOpenHouse: next,
    pastCount: 1,
    upcomingCount: 1,
    weekOpenHouseCount: 1,
  };
}

const TODAY = "2026-09-10";
const WESTPORT = event("16 Sea Spray Rd", "2026-09-10");
const WILTON = event("5 Locust Ln", "2026-09-12");

const LISTINGS: OpenHouseListing[] = [
  fixture("Westport", "06880", "16 Sea Spray Rd", WESTPORT),
  fixture("Wilton", "06897", "5 Locust Ln", WILTON),
];

export function OpenHousesTownOrderPreview() {
  const { orderedTowns, customOrder, setPreferredOrder, resetOrder } =
    useOpenHouseTownOrder(TMRE_TOWNS);
  const [openTowns, setOpenTowns] = useState<Set<string>>(() => new Set());
  const [dragTown, setDragTown] = useState<string | null>(null);
  const [dragOverTown, setDragOverTown] = useState<string | null>(null);

  const grouped = useMemo(
    () =>
      groupOpenHousesByTownAndDay(LISTINGS, {
        today: TODAY,
        townOrder: orderedTowns,
      }),
    [orderedTowns],
  );
  const byTown = useMemo(
    () => new Map(grouped.map((group) => [group.town, group])),
    [grouped],
  );
  const sections = orderedTowns.map((town) => {
    const group = byTown.get(town);
    return {
      town,
      propertyCount: group?.propertyCount ?? 0,
      listings: group?.days.flatMap((day) => day.listings) ?? [],
    };
  });

  const allCollapsed = sections.every((section) => !openTowns.has(section.town));

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <button
          type="button"
          aria-pressed={allCollapsed}
          onClick={() => setOpenTowns(new Set())}
          className={`inline-flex items-center rounded-full border px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.12em] ${
            allCollapsed
              ? "border-gold/50 bg-gold/10 text-navy"
              : "border-charcoal/[0.08] bg-white text-navy"
          }`}
        >
          − All
        </button>
        <button
          type="button"
          onClick={() => setOpenTowns(new Set(sections.map((section) => section.town)))}
          className="inline-flex items-center rounded-full border border-charcoal/[0.08] bg-white px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-navy"
        >
          + All
        </button>
        {customOrder ? (
          <button
            type="button"
            onClick={resetOrder}
            className="inline-flex items-center rounded-full border border-charcoal/[0.08] bg-white px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-navy"
          >
            Reset town order
          </button>
        ) : null}
      </div>
      <div className="space-y-8">
        {sections.map((section, index) => (
          <OpenHouseTownSection
            key={section.town}
            town={section.town}
            propertyCount={section.propertyCount}
            open={openTowns.has(section.town)}
            onOpenChange={(next) =>
              setOpenTowns((current) => {
                const copy = new Set(current);
                if (next) copy.add(section.town);
                else copy.delete(section.town);
                return copy;
              })
            }
            organize={{
              canMoveUp: index > 0,
              canMoveDown: index < sections.length - 1,
              onMoveUp: () => {
                const neighbor = sections[index - 1]?.town;
                if (neighbor) {
                  setPreferredOrder(
                    placeTownNextTo(orderedTowns, section.town, neighbor, "before"),
                  );
                }
              },
              onMoveDown: () => {
                const neighbor = sections[index + 1]?.town;
                if (neighbor) {
                  setPreferredOrder(
                    placeTownNextTo(orderedTowns, section.town, neighbor, "after"),
                  );
                }
              },
              dragging: dragTown === section.town,
              dragOver: dragOverTown === section.town && dragTown !== section.town,
              onDragStart: () => setDragTown(section.town),
              onDragOver: () => setDragOverTown(section.town),
              onDragLeave: () =>
                setDragOverTown((current) => (current === section.town ? null : current)),
              onDrop: () => {
                if (dragTown && dragTown !== section.town) {
                  setPreferredOrder(
                    placeTownNextTo(orderedTowns, dragTown, section.town, "before"),
                  );
                }
                setDragTown(null);
                setDragOverTown(null);
              },
              onDragEnd: () => {
                setDragTown(null);
                setDragOverTown(null);
              },
            }}
          >
            {section.listings.length === 0 ? (
              <p className="font-mono text-xs text-slate">No open houses this week.</p>
            ) : (
              <ul className="space-y-2">
                {section.listings.map((listing) => (
                  <li
                    key={listing.mlsId}
                    className="rounded-xl border border-charcoal/[0.08] bg-white px-4 py-3"
                  >
                    <p className="text-sm font-medium text-navy">{listing.address.street}</p>
                    <p className="mt-1 font-mono text-[11px] text-slate">
                      {formatOpenHouseWhen(listing.nextOpenHouse)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </OpenHouseTownSection>
        ))}
      </div>
    </div>
  );
}
