"use client";

import { useEffect, useState } from "react";
import { useRecordLookedAtListing } from "@/hooks/useRecordLookedAtListing";
import { fmtDate, fmtMoney, formatMlsStatus } from "@/lib/listing-history";
import { buildListingDetailsPanelProps } from "@/lib/listing-detail-panel-props";
import ListingHeroPanels from "@/components/listing/ListingHeroPanels";
import ListingErrorPanel from "@/components/listing/ListingErrorPanel";
import { ListingMobileScrollSections } from "@/components/listing/ListingMobileScrollSections";
import { ListingOverviewPhotoDeck } from "@/components/listing/ListingOverviewPhotoDeck";
import ListingPhotoScrollStack from "@/components/listing/ListingPhotoScrollStack";
import ListingSidebar from "@/components/listing/ListingSidebar";
import { intelligenceSearchHrefFromListing } from "@/lib/intelligence-search-url";
import {
  listingHeaderScoreProps,
  type ListingScoreApiFields,
} from "@/lib/listing-header-score-props";
import { listingPhotosHref } from "@/lib/listing-url";
import { ListingShell } from "@/components/listing/ListingShell";
import {
  listingChromeApiUrl,
  loadTabJson,
  peekTabJson,
} from "@/lib/tab-data-prefetch";

type Schools = {
  elementary: string | null;
  middle: string | null;
  high: string | null;
  district: string | null;
};

type Listing = {
  mlsId: string;
  listingKey: string;
  status: string;
  propertyType: string;
  style: string;
  address: {
    street: string;
    unit: string;
    city: string;
    state: string;
    postalCode: string;
    full: string;
  };
  price: number | null;
  originalListPrice: number | null;
  ownerName: string | null;
  priceChangeTimestamp: string | null;
  beds: number | null;
  baths: number | null;
  sqft: number | null;
  yearBuilt: number | null;
  dom: number | null;
  listDate: string | null;
  modificationTimestamp: string | null;
  statusChangeTimestamp: string | null;
  latitude: number | null;
  longitude: number | null;
  photoCount: number | null;
  remarks: string | null;
  schools: Schools;
  raw: Record<string, string>;
};

type ApiResponse = ListingScoreApiFields & {
  listing: Listing;
  photos: string[];
};

type LoadState = "loading" | "ready" | "error" | "not-found";

const REMARKS_KEYS = ["PublicRemarks", "RemarksPublicAddendum"];

/** Survives dev Fast Refresh / remounts so the page does not flash back to loading. */
const listingDetailCache = new Map<string, ApiResponse>();

export default function ListingDetailClient({
  mlsId,
  addressHint,
  townHint,
}: {
  mlsId: string;
  addressHint?: string | null;
  townHint?: string | null;
}) {
  const [data, setData] = useState<ApiResponse | null>(
    () => listingDetailCache.get(mlsId) ?? null,
  );
  const [state, setState] = useState<LoadState>(() =>
    listingDetailCache.has(mlsId) ? "ready" : "loading",
  );
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const url = listingChromeApiUrl(mlsId);
    const cached =
      listingDetailCache.get(mlsId) ?? peekTabJson<ApiResponse>(url);
    if (cached) {
      listingDetailCache.set(mlsId, cached);
      setData(cached);
      setState("ready");
    } else {
      setData(null);
      setState("loading");
    }

    void loadTabJson<ApiResponse>(url)
      .then((d) => {
        if (cancelled) return;
        if (!d?.listing) {
          setState("not-found");
          return;
        }
        listingDetailCache.set(mlsId, d);
        setData(d);
        setState("ready");
      })
      .catch((err) => {
        if (cancelled) return;
        console.error("[listing detail] fetch failed", err);
        setErrorMsg(err instanceof Error ? err.message : "Fetch failed");
        setState("error");
      });
    return () => {
      cancelled = true;
    };
  }, [mlsId]);

  useRecordLookedAtListing(state === "ready", data?.listing ?? null, {
    addressHint,
    townHint,
  });

  if (state === "loading") {
    return (
      <ListingShell>
        <div className="text-center text-white/60 font-mono text-xs tracking-wide py-32">
          <span className="inline-flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-gold animate-pulse-dot" />
            Loading {addressHint?.trim() || "listing"}…
          </span>
        </div>
      </ListingShell>
    );
  }

  if (state === "not-found") {
    return (
      <ListingShell>
        <ListingErrorPanel
          title="Listing not found"
          body={`${addressHint?.trim() || "This listing"} isn't in the active feed right now. It may have closed, expired, or been withdrawn.`}
        />
      </ListingShell>
    );
  }

  if (state === "error" || !data) {
    return (
      <ListingShell>
        <ListingErrorPanel
          title="Couldn't load this listing"
          body={errorMsg ?? "Try again in a moment."}
        />
      </ListingShell>
    );
  }

  const { listing } = data;
  const l = listing;
  const photoCount = l.photoCount ?? 0;
  const remarks =
    l.remarks?.trim() ||
    REMARKS_KEYS.map((k) => l.raw?.[k])
      .filter(Boolean)
      .join("\n\n");
  const street = l.address.street || l.address.full;
  const mapsQuery =
    l.address.full?.trim() ||
    [street, l.address.city, l.address.state, l.address.postalCode].filter(Boolean).join(", ");
  const details = buildListingDetailsPanelProps(
    { ...l, townHint: townHint ?? null },
    fmtMoney,
    {
      listingId: mlsId,
      addressHint: street || addressHint,
      townHint: townHint || l.address.city,
      cityMedianPpsf: data.cityMedianPpsf,
      listingPricePerSqft: data.pricePerSqft,
      medianPpsfBand: data.medianPpsfBand,
    },
  );
  const isClosed = details.isClosed;
  const isComingSoon = formatMlsStatus(l.status) === "Coming Soon";
  const mapSlot = {
    latitude: l.latitude,
    longitude: l.longitude,
    addressQuery: mapsQuery,
  };
  const heroSlot = !isComingSoon ? (
    <ListingPhotoScrollStack
      mlsId={l.mlsId}
      photoCount={photoCount}
      altBase={street || "Listing photo"}
      mapSlot={mapSlot}
      photoHref={(i) =>
        listingPhotosHref(
          l.mlsId,
          street || addressHint,
          townHint || l.address.city,
          i,
        )
      }
    />
  ) : null;

  return (
    <ListingShell>
      <ListingHeroPanels
        header={{
          mlsId: l.mlsId,
          status: l.status,
          address: l.address,
          propertyType: l.propertyType,
          style: l.style,
          beds: l.beds,
          baths: l.baths,
          sqft: l.sqft,
          yearBuilt: l.yearBuilt,
          bedBathSearchHref: intelligenceSearchHrefFromListing(l),
          heroSlot,
          ...listingHeaderScoreProps({
            goldilocksScore: data.goldilocksScore,
            goldilocksBreakdown: data.goldilocksBreakdown,
            insight: data.insight,
            title: street,
            subtitle: townHint || l.address.city,
            propertyType: l.propertyType,
          }),
        }}
        location={{
          latitude: l.latitude,
          longitude: l.longitude,
          addressQuery: mapsQuery,
        }}
        subnav={{
          mlsId,
          active: "overview",
          addressHint: street || addressHint,
          townHint,
        }}
        interest={
          !isClosed
            ? {
                mlsId: l.mlsId,
                address: street,
                city: townHint || l.address.city,
              }
            : null
        }
        belowTabs={
          <ListingOverviewPhotoDeck
            remarks={remarks || null}
            mlsId={l.mlsId}
            photoCount={photoCount > 0 ? photoCount : null}
            heroAlt={street || "Listing photo"}
            hideHero={isComingSoon}
            showHero
            mapSlot={mapSlot}
          />
        }
        remarks={remarks || null}
        sections={
          <ListingMobileScrollSections
            mlsId={l.mlsId}
            addressHint={street || addressHint}
            townHint={townHint || l.address.city}
            mode="panel"
          />
        }
        sidebar={<ListingSidebar details={details} />}
      />
    </ListingShell>
  );
}
