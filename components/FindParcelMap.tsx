"use client";

import { useEffect, useMemo, useState } from "react";
import DealBoardMap, {
  type DealBoardMapListing,
} from "@/components/intelligence/DealBoardMap";
import MatchingCriteriaSummary from "@/components/listing/MatchingCriteriaSummary";
import {
  FIND_PARCEL_MAP_RADIUS_MILES,
  neighborMatchesAroundFilter,
  type FindParcelMapAroundFilter,
  type FindParcelMapMode,
  type FindParcelMapPayload,
} from "@/lib/find-parcel-map-shared";
import {
  comparableListingMatchesSession,
  defaultSessionOverrides,
  type SessionMatchOverrides,
} from "@/lib/listing-comparables-session";
import type { ComparableListing } from "@/lib/listing-comparables-shared";

function neighborToComparable(
  neighbor: FindParcelMapPayload["neighbors"][number],
): ComparableListing {
  return {
    mlsId: neighbor.pin.key,
    listingKey: neighbor.pin.key,
    address: neighbor.pin.address,
    city: neighbor.pin.city ?? null,
    zip: neighbor.zip,
    price: neighbor.pin.price,
    closePrice: null,
    closeDate: null,
    beds: neighbor.pin.beds ?? null,
    baths: neighbor.pin.baths ?? null,
    lotAcres: null,
    sqft: neighbor.pin.sqft,
    vintageBucket: "unknown",
    vintageLabel: neighbor.vintageLabel,
    yearBuilt: neighbor.yearBuilt,
    furnished: neighbor.furnished ?? null,
    pricePerSqft: null,
    dom: null,
    photoCount: neighbor.pin.photoCount ?? null,
    latitude: neighbor.pin.latitude ?? null,
    longitude: neighbor.pin.longitude ?? null,
    locationPremiumMultiplier: 1,
  };
}

const MODE_LABEL: Record<FindParcelMapMode, string> = {
  around: "Around this home",
  "like-kind": "Like kind",
};

const AROUND_LABEL: Record<FindParcelMapAroundFilter, string> = {
  all: "All nearby",
  same_street: "Same street",
  cross_street: "Cross streets",
  radius: `${FIND_PARCEL_MAP_RADIUS_MILES} mi`,
};

export default function FindParcelMap({
  visionPid,
  initial,
}: {
  visionPid: string;
  initial?: FindParcelMapPayload | null;
}) {
  const [payload, setPayload] = useState<FindParcelMapPayload | null>(
    initial ?? null,
  );
  const [loadError, setLoadError] = useState<string | null>(null);
  const [mode, setMode] = useState<FindParcelMapMode>("around");
  const [around, setAround] = useState<FindParcelMapAroundFilter>("all");
  const [session, setSession] = useState<SessionMatchOverrides | null>(null);
  const [activeKey, setActiveKey] = useState<string | null>(null);

  useEffect(() => {
    if (initial) return;
    let cancelled = false;
    void fetch(`/api/find/westport/${encodeURIComponent(visionPid)}/map`, {
      cache: "no-store",
    })
      .then(async (res) => {
        if (!res.ok) throw new Error("Could not load the map");
        return (await res.json()) as FindParcelMapPayload;
      })
      .then((body) => {
        if (!cancelled) setPayload(body);
      })
      .catch((err) => {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : "Could not load the map");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [visionPid, initial]);

  useEffect(() => {
    if (!payload?.criteria) {
      setSession(null);
      return;
    }
    setSession(defaultSessionOverrides(payload.criteria));
  }, [payload?.criteria]);

  const visibleNeighbors = useMemo(() => {
    if (!payload) return [];
    if (mode === "around") {
      return payload.neighbors.filter((row) =>
        neighborMatchesAroundFilter(row, around, payload.radiusMiles),
      );
    }
    if (!payload.criteria || !session) return [];
    return payload.neighbors.filter((row) =>
      comparableListingMatchesSession(
        neighborToComparable(row),
        payload.criteria!,
        session,
      ),
    );
  }, [payload, mode, around, session]);

  const listings = useMemo<DealBoardMapListing[]>(() => {
    if (!payload) return [];
    const pins: DealBoardMapListing[] = visibleNeighbors.map((row) => row.pin);
    if (payload.subject) pins.unshift(payload.subject);
    return pins;
  }, [payload, visibleNeighbors]);

  const hrefFor = (listing: DealBoardMapListing) => {
    if (listing.key === payload?.subjectKey) {
      return `/find/westport/${encodeURIComponent(visionPid)}`;
    }
    const match = payload?.neighbors.find((row) => row.pin.key === listing.key);
    return match?.href ?? `/listings/${encodeURIComponent(listing.key)}`;
  };

  if (loadError) {
    return (
      <p className="font-mono text-sm text-white/60">{loadError}</p>
    );
  }
  if (!payload) {
    return (
      <p className="font-mono text-sm text-white/60">Loading neighborhood map…</p>
    );
  }
  if (!payload.subject) {
    return (
      <p className="font-mono text-sm text-white/60">
        No map coordinates for this parcel yet — link an MLS listing or ingest
        the last listing to drop a pin.
      </p>
    );
  }

  const sameStreet = payload.neighbors.filter((n) => n.relation === "same_street")
    .length;
  const cross = payload.neighbors.filter((n) => n.relation === "cross_street")
    .length;
  const inRadius = payload.neighbors.filter(
    (n) => n.miles <= payload.radiusMiles,
  ).length;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
      <div>
        <div className="mb-3 flex flex-wrap gap-2">
          {(Object.keys(MODE_LABEL) as FindParcelMapMode[]).map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => setMode(id)}
              aria-pressed={mode === id}
              className={`rounded-full px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.14em] ${
                mode === id
                  ? "bg-gold text-[#131F38]"
                  : "border border-white/20 text-white/70 hover:text-white"
              }`}
            >
              {MODE_LABEL[id]}
            </button>
          ))}
        </div>
        {mode === "around" ? (
          <div className="mb-3 flex flex-wrap gap-2">
            {(Object.keys(AROUND_LABEL) as FindParcelMapAroundFilter[]).map(
              (id) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setAround(id)}
                  aria-pressed={around === id}
                  className={`rounded-full px-3 py-1 font-mono text-[10px] uppercase tracking-[0.12em] ${
                    around === id
                      ? "bg-white text-navy"
                      : "border border-white/15 text-white/60 hover:text-white"
                  }`}
                >
                  {AROUND_LABEL[id]}
                </button>
              ),
            )}
          </div>
        ) : null}
        <p className="mb-3 font-mono text-[11px] text-white/55">
          {sameStreet} same street · {cross} cross streets · {inRadius} within{" "}
          {payload.radiusMiles} mi
          {mode === "like-kind"
            ? ` · ${visibleNeighbors.length} like kind on the map`
            : ` · ${visibleNeighbors.length} shown`}
        </p>
        <DealBoardMap
          listings={listings}
          boundZips={payload.boundZips}
          highlightZip={payload.highlightZip}
          scopeLabel="Westport"
          activeKey={activeKey}
          onSelect={setActiveKey}
          hrefFor={hrefFor}
          subjectKey={payload.subjectKey}
          fitZips={payload.boundZips}
          heightClass="h-[420px] lg:h-[520px]"
          className="overflow-hidden rounded-2xl border border-white/10"
        />
      </div>
      <aside className="rounded-2xl border border-charcoal/[0.08] bg-cream p-4 text-navy">
        {mode === "like-kind" && payload.criteria && session ? (
          <>
            <p className="mb-3 font-mono text-[10px] uppercase tracking-[0.16em] text-gold">
              Like-kind criteria
            </p>
            <MatchingCriteriaSummary
              criteria={payload.criteria}
              session={session}
              onSessionChange={setSession}
              baseline={defaultSessionOverrides(payload.criteria)}
              onReset={() =>
                setSession(defaultSessionOverrides(payload.criteria!))
              }
              defaultControlsOpen
            />
          </>
        ) : mode === "like-kind" ? (
          <p className="font-mono text-sm text-slate">
            Need bedrooms and bathrooms on the Field Card or MLS to match
            like-kind homes.
            {payload.missingCriteria.length > 0
              ? ` Missing ${payload.missingCriteria.join(", ")}.`
              : ""}
          </p>
        ) : (
          <p className="font-mono text-sm leading-relaxed text-slate">
            Same street, crossing streets within {payload.radiusMiles} miles,
            or that radius around the pin. Pins are stored MLS listings with
            coordinates. The house mark is this parcel.
          </p>
        )}
      </aside>
    </div>
  );
}
