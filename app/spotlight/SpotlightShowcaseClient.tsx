"use client";

import { useMemo } from "react";
import { useSearchParams } from "next/navigation";
import ListingShowcaseView, {
  ShowcaseMessage,
} from "@/components/listing/showcase/ListingShowcaseView";
import type { ShowcaseHost } from "@/components/listing/showcase/showcase-host";
import type { ShowcaseListing } from "@/components/listing/showcase/showcase-types";
import { SpotlightPropertyTabs } from "@/components/spotlight/SpotlightPropertyTabs";
import { useSpotlightListing } from "@/hooks/useSpotlightListing";
import { buildSpotlightDetailsPanelProps } from "@/lib/listing-detail-panel-props";
import { fmtMoney } from "@/lib/listing-history";
import { listingPhotoProxyUrlsFromCount } from "@/lib/listing-url";
import {
  spotlightAllowsInterest,
  type SpotlightDisplay,
  type SpotlightMlsListing,
} from "@/lib/spotlight-display";
import { spotlightPropertySearchParam } from "@/lib/spotlight-listing";
import type { SpotlightPresentation } from "@/lib/spotlight-privacy-shared";
import { SPOTLIGHT_SHARE_URL } from "@/lib/spotlight-url";
import type { ListingTab } from "@/components/listing/ListingSubnav";

const MAX_PHOTOS = 40;

function toShowcaseListing(
  display: SpotlightDisplay,
  mls: SpotlightMlsListing | null,
  presentation: SpotlightPresentation,
): ShowcaseListing {
  const showAddress = presentation.privacy.showAddress;
  const street = showAddress
    ? mls?.address?.street?.trim() ||
      display.config.address.street ||
      presentation.headerAddress.street
    : presentation.headerAddress.street;
  const city = showAddress
    ? mls?.address?.city?.trim() || display.config.address.city || ""
    : "";
  const state = showAddress
    ? mls?.address?.state?.trim() || display.config.address.state || ""
    : "";
  const postalCode = showAddress
    ? mls?.address?.postalCode?.trim() ||
      display.config.address.postalCode ||
      ""
    : "";
  const showPin = presentation.privacy.showPropertyMap;

  return {
    mlsId: display.mlsId,
    listingKey: display.listingKey ?? "",
    status: display.status,
    propertyType: display.propertyType,
    style: display.style,
    address: {
      street,
      unit: "",
      city,
      state,
      postalCode,
      full: presentation.headerAddress.full || street,
    },
    price: display.price,
    beds: display.beds,
    baths: display.baths,
    sqft: display.sqft,
    yearBuilt: display.yearBuilt,
    dom: display.dom,
    latitude: showPin ? (mls?.latitude ?? display.latitude) : null,
    longitude: showPin ? (mls?.longitude ?? display.longitude) : null,
    lotAcres: mls?.lotAcres ?? null,
    propertyTax: mls?.propertyTax ?? null,
    propertyTaxYear: mls?.propertyTaxYear ?? null,
    modificationTimestamp: display.modificationTimestamp,
    photoCount: display.photoCount,
    remarks: display.remarks,
    schools: display.schools,
    raw: mls?.raw ?? {},
  };
}

function spotlightQs(
  propertyTab: ReturnType<typeof useSpotlightListing>["propertyTab"],
  extra?: Record<string, string>,
): string {
  const params = new URLSearchParams(extra);
  const property = spotlightPropertySearchParam(propertyTab);
  if (property) params.set("property", property);
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

export default function SpotlightShowcaseClient({
  initialTab = null,
}: {
  initialTab?: ListingTab | null;
}) {
  const searchParams = useSearchParams();
  const {
    display,
    loadState,
    mlsListing,
    goldilocksScore,
    goldilocksBreakdown,
    insight,
    cityMedianPpsf,
    pricePerSqft,
    medianPpsfBand,
    marketBandLabel,
    propertyTab,
    presentation,
  } = useSpotlightListing();

  const listing = useMemo(
    () => toShowcaseListing(display, mlsListing, presentation),
    [display, mlsListing, presentation],
  );

  const photoParam = Number.parseInt(searchParams.get("photo") ?? "", 10);
  const initialPhotoIndex =
    Number.isFinite(photoParam) && photoParam >= 0 ? photoParam : 0;

  if (loadState === "error") {
    return (
      <ShowcaseMessage>Couldn&apos;t load spotlight. Try again in a moment.</ShowcaseMessage>
    );
  }

  const detailsPanelProps = buildSpotlightDetailsPanelProps(
    display,
    mlsListing,
    fmtMoney,
    presentation,
    {
      cityMedianPpsf,
      listingPricePerSqft: pricePerSqft,
      medianPpsfBand,
      marketBandLabel,
    },
  );

  const photos = listingPhotoProxyUrlsFromCount(
    display.mlsId,
    display.photoCount,
    MAX_PHOTOS,
    { size: "full" },
  );

  const locationLine = presentation.privacy.showAddress
    ? [
        presentation.headerAddress.city,
        presentation.headerAddress.state,
        presentation.headerAddress.postalCode,
      ]
        .filter(Boolean)
        .join(" ")
    : display.config.displayLocation;

  const qs = spotlightQs(propertyTab);
  const compsQs = spotlightQs(propertyTab);
  const rentalQs = spotlightQs(propertyTab, { kind: "rental" });

  const host: ShowcaseHost = {
    routeBase: "spotlight",
    headline: presentation.headerAddress.street,
    locationLine,
    photoAlt: presentation.headerAddress.street || display.config.displayTitle,
    street: presentation.headerAddress.street,
    city: presentation.headerAddress.city || display.config.displayLocation,
    addressHint: presentation.addressHint,
    townHint: presentation.townHint,
    ifAddressHint: presentation.ifAddressHint,
    privacyMode: presentation.privacyMode,
    hideStatusBadge: display.config.hideStatusBadge ?? false,
    headerAddress: presentation.headerAddress,
    adminAddress: {
      city:
        display.intelligenceListing.address.city || display.config.address.city,
      state: display.config.address.state,
      postalCode:
        display.intelligenceListing.address.postalCode ||
        display.config.address.postalCode,
    },
    shareHref: SPOTLIGHT_SHARE_URL,
    showClassicViewLink: true,
    showcaseViewHref: `/spotlight${qs}`,
    classicViewHref: `/spotlight${spotlightQs(propertyTab, { view: "classic" })}`,
    interest: spotlightAllowsInterest(display)
      ? {
          mlsId: display.config.id,
          address: presentation.interestAddress,
          city: presentation.interestCity,
        }
      : null,
    obfuscatePhoto: presentation.shouldObfuscatePhoto,
    showHero: presentation.showHero,
    map: {
      latitude: presentation.mapLocation.latitude,
      longitude: presentation.mapLocation.longitude,
      hidePin: presentation.mapLocation.hidePin,
      outlineTown: presentation.mapLocation.outlineTown,
      defaultZoom: presentation.mapLocation.defaultZoom,
      addressQuery: presentation.mapLocation.addressQuery,
      postalCode: presentation.privacy.showAddress
        ? listing.address.postalCode || display.config.address.postalCode || null
        : display.config.address.postalCode || null,
    },
    hideMlsNumber: presentation.privacyMode,
    compsFetchUrl: `/api/spotlight/comparables${compsQs}`,
    rentalCompsFetchUrl: `/api/spotlight/comparables${rentalQs}`,
    uagFetchUrl: `/api/spotlight/uag${qs}`,
    propertyTabs: <SpotlightPropertyTabs />,
    initialTab,
    premiereLights: true,
  };

  return (
    <ListingShowcaseView
      listing={listing}
      photos={photos}
      host={host}
      detailsPanelProps={detailsPanelProps}
      remarks={display.remarks ?? ""}
      insight={insight}
      score={{
        goldilocksScore,
        goldilocksBreakdown,
        insight,
        cityMedianPpsf,
        pricePerSqft,
        medianPpsfBand,
        marketBandLabel,
      }}
      vision={display.vision}
      initialPhotoIndex={initialPhotoIndex}
    />
  );
}
