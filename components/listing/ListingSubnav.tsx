"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import ListingInterestButton from "@/components/listing/ListingInterestButton";
import ListingLocationMap from "@/components/listing/ListingLocationMap";
import { listingSectionHref } from "@/lib/listing-url";

export type ListingTab = "overview" | "photos" | "history";

export type ListingInterestProps = {
  mlsId: string;
  address: string;
  city?: string | null;
};

export type ListingLocationProps = {
  latitude: number | null;
  longitude: number | null;
  addressQuery: string;
};

export default function ListingSubnav({
  mlsId,
  active,
  addressHint,
  townHint,
  interest = null,
  location = null,
}: {
  mlsId: string;
  active: ListingTab;
  addressHint?: string | null;
  townHint?: string | null;
  interest?: ListingInterestProps | null;
  location?: ListingLocationProps | null;
}) {
  const searchParams = useSearchParams();

  // Preserve any extra query params beyond address/city
  const extra = new URLSearchParams(searchParams.toString());
  extra.delete("address");
  extra.delete("city");
  const extraQs = extra.toString();

  const overviewHref = listingSectionHref(
    mlsId,
    "overview",
    addressHint,
    townHint,
    extraQs || undefined,
  );
  const photosHref = listingSectionHref(
    mlsId,
    "photos",
    addressHint,
    townHint,
    extraQs || undefined,
  );
  const historyHref = listingSectionHref(
    mlsId,
    "history",
    addressHint,
    townHint,
    extraQs || undefined,
  );

  const tabs: { id: ListingTab; label: string; href: string }[] = [
    { id: "overview", label: "Overview", href: overviewHref },
    { id: "photos", label: "Photos", href: photosHref },
    { id: "history", label: "History", href: historyHref },
  ];

  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-x-4 gap-y-3 border-b border-white/10 -mx-1">
      <nav className="flex gap-1" aria-label="Listing sections">
        {tabs.map((tab) => {
          const isActive = active === tab.id;
          return (
            <Link
              key={tab.id}
              href={tab.href}
              className={`px-4 py-2.5 font-mono text-[10px] tracking-[0.15em] uppercase transition-colors border-b-2 -mb-px ${
                isActive
                  ? "text-gold border-gold"
                  : "text-white/50 border-transparent hover:text-white/80"
              }`}
              aria-current={isActive ? "page" : undefined}
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>
      {location || interest ? (
        <div className="flex flex-col items-end gap-3 pb-1.5">
          {location ? (
            <ListingLocationMap
              latitude={location.latitude}
              longitude={location.longitude}
              addressQuery={location.addressQuery}
              className="w-36 sm:w-40"
            />
          ) : null}
          {interest ? (
            <ListingInterestButton
              mlsId={interest.mlsId}
              address={interest.address}
              city={interest.city}
              variant="inline"
            />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
