"use client";

import { useMemo, useState } from "react";
import ListingLocationMap from "@/components/listing/ListingLocationMap";
import {
  listingDisplayMapPoint,
  resolveListingMapPointFromParts,
  type ListingMapPoint,
} from "@/lib/listing-map-point-shared";

type FixtureId = "outside" | "inside";

/** Closed lon/lat box standing in for Westport zip outlines. */
const WESTPORT_RINGS = [
  [
    [-73.4, 41.1],
    [-73.3, 41.1],
    [-73.3, 41.185],
    [-73.4, 41.185],
    [-73.4, 41.1],
  ] as [number, number][],
];

const FIXTURES: Record<
  FixtureId,
  {
    label: string;
    street: string;
    mls: { latitude: number; longitude: number };
    geocode: { latitude: number; longitude: number };
  }
> = {
  outside: {
    label: "MLS outside town (36 Lyons Plain)",
    street: "36 Lyons Plain Rd, Westport, CT 06880",
    mls: { latitude: 41.1872, longitude: -73.35692 },
    geocode: { latitude: 41.179353, longitude: -73.358066 },
  },
  inside: {
    label: "MLS already in town (keep MLS)",
    street: "12 Main St, Westport, CT 06880",
    mls: { latitude: 41.141, longitude: -73.358 },
    geocode: { latitude: 41.1412, longitude: -73.3578 },
  },
};

function fmt(lat: number, lon: number): string {
  return `${lat.toFixed(5)}, ${lon.toFixed(5)}`;
}

function sourceLabel(source: ListingMapPoint["source"]): string {
  return source === "address-geocode" ? "Census street geocode" : "MLS";
}

export function ListingMapTownPinPreview() {
  const [fixtureId, setFixtureId] = useState<FixtureId>("outside");
  const fixture = FIXTURES[fixtureId];
  const decided = useMemo(
    () =>
      resolveListingMapPointFromParts({
        mls: fixture.mls,
        geocode: fixture.geocode,
        townRings: WESTPORT_RINGS,
      }),
    [fixture],
  );
  const display = listingDisplayMapPoint(fixture.mls, decided);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2">
        {(Object.keys(FIXTURES) as FixtureId[]).map((id) => (
          <button
            key={id}
            type="button"
            onClick={() => setFixtureId(id)}
            className={`rounded-full border px-4 py-2 font-mono text-[11px] uppercase tracking-[0.14em] ${
              fixtureId === id
                ? "border-gold bg-navy text-cream"
                : "border-charcoal/15 bg-white text-navy hover:border-gold/50"
            }`}
          >
            {FIXTURES[id].label}
          </button>
        ))}
      </div>

      <p className="text-sm text-slate">
        <span className="font-medium text-navy">{fixture.street}</span>
        {" — "}
        map uses <span className="font-medium text-navy">{sourceLabel(decided?.source ?? "mls")}</span>
        {decided
          ? ` at ${fmt(decided.latitude, decided.longitude)}`
          : ""}
        . Stored MLS stays {fmt(fixture.mls.latitude, fixture.mls.longitude)}.
      </p>

      <div className="grid gap-4 md:grid-cols-2">
        <figure className="overflow-hidden rounded-2xl border border-charcoal/[0.08] bg-white">
          <div className="h-64">
            <ListingLocationMap
              latitude={fixture.mls.latitude}
              longitude={fixture.mls.longitude}
              addressQuery={fixture.street}
              variant="hero"
              className="h-full"
              seamless
            />
          </div>
          <figcaption className="border-t border-charcoal/[0.06] px-4 py-3 font-mono text-[10px] uppercase tracking-[0.14em] text-slate">
            MLS pin · {fmt(fixture.mls.latitude, fixture.mls.longitude)}
          </figcaption>
        </figure>
        <figure className="overflow-hidden rounded-2xl border border-charcoal/[0.08] bg-white">
          <div className="h-64">
            <ListingLocationMap
              latitude={display.latitude}
              longitude={display.longitude}
              addressQuery={fixture.street}
              variant="hero"
              className="h-full"
              seamless
            />
          </div>
          <figcaption className="border-t border-charcoal/[0.06] px-4 py-3 font-mono text-[10px] uppercase tracking-[0.14em] text-slate">
            Listing map · {sourceLabel(decided?.source ?? "mls")} ·{" "}
            {display.latitude != null && display.longitude != null
              ? fmt(display.latitude, display.longitude)
              : "—"}
          </figcaption>
        </figure>
      </div>
    </div>
  );
}
