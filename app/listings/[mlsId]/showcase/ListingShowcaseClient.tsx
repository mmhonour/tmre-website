"use client";

import { useEffect, useState } from "react";
import ListingDetailClient from "@/app/listings/[mlsId]/ListingDetailClient";
import ListingShowcaseView, {
  ShowcaseMessage,
} from "@/components/listing/showcase/ListingShowcaseView";
import type { ShowcaseHost } from "@/components/listing/showcase/showcase-host";
import type { ShowcaseListing } from "@/components/listing/showcase/showcase-types";
import { buildListingDetailsPanelProps } from "@/lib/listing-detail-panel-props";
import { fmtMoney } from "@/lib/listing-history";
import type { ListingScoreApiFields } from "@/lib/listing-header-score-props";
import type { ListingVisionLink } from "@/lib/listing-vision-link-shared";
import {
  listingDetailHref,
  listingPhotoProxyUrlsFromCount,
  listingSectionHref,
  listingShareHref,
} from "@/lib/listing-url";
import { listingChromeApiUrl, loadTabJson } from "@/lib/tab-data-prefetch";

const MAX_PHOTOS = 40;
const REMARKS_KEYS = ["PublicRemarks", "RemarksPublicAddendum"];

type ApiResponse = ListingScoreApiFields & {
  listing: ShowcaseListing;
  vision?: ListingVisionLink | null;
};

type LoadState = "loading" | "ready" | "error" | "not-found";

export default function ListingShowcaseClient({
  mlsId,
  addressHint,
  townHint,
  productionPanel = false,
}: {
  mlsId: string;
  addressHint?: string | null;
  townHint?: string | null;
  /** `?panel=production` — render the real Overview page below the photo. */
  productionPanel?: boolean;
}) {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [state, setState] = useState<LoadState>("loading");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const url = listingChromeApiUrl(mlsId);

    void loadTabJson<ApiResponse>(url)
      .then((d) => {
        if (cancelled) return;
        if (!d?.listing) {
          setState("not-found");
          return;
        }
        setData(d);
        setState("ready");
      })
      .catch((err) => {
        if (cancelled) return;
        setErrorMsg(err instanceof Error ? err.message : "Fetch failed");
        setState("error");
      });
    return () => {
      cancelled = true;
    };
  }, [mlsId]);

  const listing = data?.listing ?? null;

  if (state === "loading") {
    return (
      <ShowcaseMessage>
        Loading {addressHint?.trim() || `listing ${mlsId}`}…
      </ShowcaseMessage>
    );
  }

  if (state === "not-found" || !listing) {
    return (
      <ShowcaseMessage>
        {errorMsg
          ? `Couldn't load listing ${mlsId} — ${errorMsg}`
          : `Listing ${mlsId} isn't in the feed right now.`}
      </ShowcaseMessage>
    );
  }

  const street =
    listing.address.street || listing.address.full || addressHint || "";
  const city = townHint || listing.address.city;
  const insight = data?.insight?.trim() || null;
  const detailsPanelProps = buildListingDetailsPanelProps(
    { ...listing, townHint: city },
    fmtMoney,
    {
      listingId: listing.mlsId,
      addressHint: street || addressHint,
      townHint: city,
      cityMedianPpsf: data?.cityMedianPpsf,
      listingPricePerSqft: data?.pricePerSqft,
      medianPpsfBand: data?.medianPpsfBand,
      marketBandLabel: data?.marketBandLabel,
    },
  );
  const remarks =
    listing.remarks?.trim() ||
    REMARKS_KEYS.map((k) => listing.raw?.[k])
      .filter(Boolean)
      .join("\n\n");
  const photos = listingPhotoProxyUrlsFromCount(
    listing.mlsId,
    listing.photoCount ?? 0,
    MAX_PHOTOS,
    { size: "full" },
  );
  const locationLine = [city, listing.address.state, listing.address.postalCode]
    .filter(Boolean)
    .join(" ");

  const host: ShowcaseHost = {
    routeBase: "listing",
    headline: street,
    locationLine,
    photoAlt: street || `Listing ${listing.mlsId}`,
    street,
    city,
    addressHint: street || addressHint || null,
    townHint: city,
    ifAddressHint: street || addressHint || null,
    privacyMode: false,
    hideStatusBadge: false,
    headerAddress: {
      street,
      full: listing.address.full || street,
      city,
      state: listing.address.state,
      postalCode: listing.address.postalCode,
    },
    adminAddress: null,
    shareHref: listingShareHref(listing.mlsId),
    showClassicViewLink: true,
    showcaseViewHref: listingDetailHref(listing.mlsId, street, city),
    classicViewHref: listingSectionHref(
      listing.mlsId,
      "overview",
      street,
      city,
      "panel=production",
    ),
    interest: detailsPanelProps.isClosed
      ? null
      : { mlsId: listing.mlsId, address: street, city },
    obfuscatePhoto: () => false,
    showHero: photos.length > 0,
    map: {
      latitude: listing.latitude,
      longitude: listing.longitude,
      hidePin: false,
      outlineTown: null,
      defaultZoom: 15,
      addressQuery: street,
      postalCode: listing.address.postalCode,
    },
    hideMlsNumber: false,
  };

  return (
    <ListingShowcaseView
      listing={listing}
      photos={photos}
      host={host}
      detailsPanelProps={detailsPanelProps}
      remarks={remarks}
      insight={insight}
      score={data ?? {}}
      vision={data?.vision ?? null}
      productionPanel={productionPanel}
      productionPanelSlot={
        productionPanel ? (
          <ListingDetailClient
            mlsId={mlsId}
            addressHint={street || addressHint}
            townHint={city}
            embedded
          />
        ) : null
      }
    />
  );
}
