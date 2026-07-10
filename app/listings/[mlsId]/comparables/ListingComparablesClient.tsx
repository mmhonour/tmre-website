"use client";

import { useEffect, useState } from "react";
import { useRecordLookedAtListing } from "@/hooks/useRecordLookedAtListing";
import { formatMlsStatus, fmtMoney } from "@/lib/listing-history";
import { buildListingDetailsPanelProps } from "@/lib/listing-detail-panel-props";
import ListingHeroPanels from "@/components/listing/ListingHeroPanels";
import ListingSidebar from "@/components/listing/ListingSidebar";
import ListingErrorPanel from "@/components/listing/ListingErrorPanel";
import { ListingComparablesPageContent } from "@/components/listing/ListingComparablesPanel";
import { intelligenceSearchHrefFromListing } from "@/lib/intelligence-search-url";
import {
  listingHeaderScoreProps,
  type ListingScoreApiFields,
} from "@/lib/listing-header-score-props";
import { ListingShell } from "@/components/listing/ListingShell";

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
  beds: number | null;
  baths: number | null;
  sqft: number | null;
  yearBuilt: number | null;
  dom: number | null;
  photoCount: number | null;
  latitude: number | null;
  longitude: number | null;
  schools: Schools;
  raw: Record<string, string>;
};

type LoadState = "loading" | "ready" | "error" | "not-found";

export default function ListingComparablesClient({
  mlsId,
  addressHint,
  townHint,
  comparablesKind = "sale",
}: {
  mlsId: string;
  addressHint?: string | null;
  townHint?: string | null;
  comparablesKind?: "sale" | "rental";
}) {
  const [listing, setListing] = useState<Listing | null>(null);
  const [goldilocksScore, setGoldilocksScore] = useState<number | null>(null);
  const [edgeScore, setEdgeScore] = useState<number | null>(null);
  const [goldilocksBreakdown, setGoldilocksBreakdown] =
    useState<ListingScoreApiFields["goldilocksBreakdown"]>(null);
  const [insight, setInsight] = useState<string | null>(null);
  const [state, setState] = useState<LoadState>("loading");
  const activeTab =
    comparablesKind === "rental" ? "comparable-rentals" : "comparables";

  useEffect(() => {
    let cancelled = false;
    setState("loading");
    fetch(`/api/listings/${encodeURIComponent(mlsId)}`)
      .then(async (r) => {
        if (r.status === 404) {
          if (!cancelled) setState("not-found");
          return null;
        }
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return (await r.json()) as ListingScoreApiFields & { listing: Listing };
      })
      .then((d) => {
        if (!d || cancelled) return;
        setListing(d.listing);
        setGoldilocksScore(d.goldilocksScore ?? null);
        setEdgeScore(d.edgeScore ?? null);
        setGoldilocksBreakdown(d.goldilocksBreakdown ?? null);
        setInsight(d.insight ?? null);
        setState("ready");
      })
      .catch(() => {
        if (!cancelled) setState("error");
      });
    return () => {
      cancelled = true;
    };
  }, [mlsId]);

  useRecordLookedAtListing(state === "ready", listing, {
    addressHint,
    townHint,
  });

  if (state === "loading") {
    return (
      <ListingShell>
        <div className="text-center text-white/60 font-mono text-xs tracking-wide py-32">
          <span className="inline-flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-gold animate-pulse-dot" />
            Loading comparables…
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
          body={`${addressHint?.trim() || "This listing"} isn't available right now.`}
        />
      </ListingShell>
    );
  }

  if (state === "error" || !listing) {
    return (
      <ListingShell>
        <ListingErrorPanel
          title="Couldn't load this listing"
          body="Try again in a moment."
        />
      </ListingShell>
    );
  }

  const street = listing.address.street || listing.address.full;
  const resolvedTown = townHint || listing.address.city;
  const mapsQuery =
    listing.address.full?.trim() ||
    [
      street,
      listing.address.city,
      listing.address.state,
      listing.address.postalCode,
    ]
      .filter(Boolean)
      .join(", ");
  const isClosed = formatMlsStatus(listing.status) === "Closed";
  const details = buildListingDetailsPanelProps(
    { ...listing, townHint: townHint ?? null },
    fmtMoney,
    {
      listingId: mlsId,
      addressHint: street || addressHint,
      townHint: resolvedTown,
    },
  );

  return (
    <ListingShell>
      <ListingHeroPanels
        header={{
          mlsId: listing.mlsId,
          status: listing.status,
          address: listing.address,
          propertyType: listing.propertyType,
          style: listing.style,
          beds: listing.beds,
          baths: listing.baths,
          sqft: listing.sqft,
          yearBuilt: listing.yearBuilt,
          bedBathSearchHref: intelligenceSearchHrefFromListing(listing),
          ...listingHeaderScoreProps({
            goldilocksScore: edgeScore ?? goldilocksScore,
            goldilocksBreakdown,
            insight,
            title: street,
            subtitle: resolvedTown,
            propertyType: listing.propertyType,
          }),
        }}
        location={{
          latitude: listing.latitude,
          longitude: listing.longitude,
          addressQuery: mapsQuery,
        }}
        subnav={{
          mlsId,
          active: activeTab,
          addressHint: street || addressHint,
          townHint: resolvedTown,
        }}
        interest={
          !isClosed
            ? {
                mlsId: listing.mlsId,
                address: street,
                city: resolvedTown,
              }
            : null
        }
        sidebar={<ListingSidebar details={details} />}
        belowTabs={
          <ListingComparablesPageContent
            mlsId={listing.mlsId}
            townHint={resolvedTown}
            kind={comparablesKind}
          />
        }
      />
    </ListingShell>
  );
}
