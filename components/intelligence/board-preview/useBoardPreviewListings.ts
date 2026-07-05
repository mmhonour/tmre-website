"use client";

import { useEffect, useState } from "react";
import { BOARD_PREVIEW_MOCK_LISTINGS } from "@/components/intelligence/board-preview/mock-listings";
import type { BoardPreviewListing, BoardPreviewStatus } from "@/components/intelligence/board-preview/types";

type ApiListing = {
  mlsId: string;
  listingKey?: string;
  propertyType: string;
  address: { street?: string; full?: string; city?: string; postalCode?: string };
  price: number | null;
  beds?: number | null;
  baths?: number | null;
  sqft?: number | null;
  photoCount?: number | null;
  calculated: {
    goldilocksScore?: number | null;
    pricePerSqft?: number | null;
    daysOnMarket?: number | null;
  };
};

function deriveStatus(l: ApiListing): BoardPreviewStatus {
  const dom = l.calculated.daysOnMarket;
  if (dom != null && dom <= 7) return "New";
  return "Active";
}

function mapApiListing(l: ApiListing, city: string): BoardPreviewListing | null {
  if (l.price == null || l.price <= 0) return null;
  return {
    key: l.listingKey || l.mlsId,
    score: l.calculated.goldilocksScore ?? 0,
    address: l.address.street || l.address.full || "—",
    city: l.address.city?.trim() || city,
    type: l.propertyType.replace(/ For Sale$/i, "").replace(/ For Lease$/i, ""),
    price: l.price,
    pricePerSqft: l.calculated.pricePerSqft ?? null,
    sqft: l.sqft ?? null,
    dom: l.calculated.daysOnMarket ?? null,
    beds: l.beds ?? null,
    baths: l.baths ?? null,
    status: deriveStatus(l),
    photoCount: l.photoCount ?? null,
    headline: "",
  };
}

export function useBoardPreviewListings(city = "Westport", limit = 8) {
  const [listings, setListings] = useState<BoardPreviewListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [source, setSource] = useState<"live" | "mock">("mock");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    fetch(`/api/listings?city=${encodeURIComponent(city)}&limit=${limit}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((body: { listings?: ApiListing[] } | null) => {
        if (cancelled) return;
        const mapped = (body?.listings ?? [])
          .map((l) => mapApiListing(l, city))
          .filter((l): l is BoardPreviewListing => l != null)
          .sort((a, b) => b.score - a.score)
          .slice(0, limit);

        if (mapped.length >= 4) {
          setListings(mapped);
          setSource("live");
        } else {
          setListings(BOARD_PREVIEW_MOCK_LISTINGS);
          setSource("mock");
        }
        setLoading(false);
      })
      .catch(() => {
        if (!cancelled) {
          setListings(BOARD_PREVIEW_MOCK_LISTINGS);
          setSource("mock");
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [city, limit]);

  return { listings, loading, source };
}
