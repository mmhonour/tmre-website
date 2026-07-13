"use client";

import Link from "next/link";
import { listingRegionOutlineClass } from "@/components/listing/listing-frame";
import { useSearchParams } from "next/navigation";
import { listingSectionHref } from "@/lib/listing-url";
import { spotlightSectionHref } from "@/lib/spotlight-url";

export type ListingTab =
  | "overview"
  | "photos"
  | "history"
  | "comparables"
  | "comparable-rentals"
  | "uag"
  | "if";

export type ListingInterestProps = {
  mlsId: string;
  address: string;
  city?: string | null;
};

export default function ListingSubnav({
  mlsId,
  active,
  addressHint,
  townHint,
  interest = null,
  routeBase = "listing",
  embedded = false,
  bare = false,
  compact = false,
}: {
  mlsId: string;
  active: ListingTab;
  addressHint?: string | null;
  townHint?: string | null;
  interest?: ListingInterestProps | null;
  routeBase?: "listing" | "spotlight";
  embedded?: boolean;
  bare?: boolean;
  compact?: boolean;
}) {
  const searchParams = useSearchParams();

  const extra = new URLSearchParams(searchParams.toString());
  extra.delete("address");
  extra.delete("city");
  const extraQs = extra.toString();

  const sectionHref = (section: ListingTab) => {
    if (routeBase === "spotlight") {
      const base = spotlightSectionHref(section);
      return extraQs ? `${base}?${extraQs}` : base;
    }
    return listingSectionHref(
      mlsId,
      section,
      addressHint,
      townHint,
      extraQs || undefined,
    );
  };

  const overviewHref = sectionHref("overview");
  const photosHref = sectionHref("photos");
  const historyHref = sectionHref("history");
  const comparablesHref = sectionHref("comparables");
  const comparableRentalsHref = sectionHref("comparable-rentals");
  const uagHref = sectionHref("uag");
  const ifHref = sectionHref("if");

  const tabs: { id: ListingTab; label: string; href: string }[] = [
    { id: "overview", label: "Overview", href: overviewHref },
    { id: "photos", label: "Photos", href: photosHref },
    { id: "comparables", label: "Comparables", href: comparablesHref },
    {
      id: "comparable-rentals",
      label: "Comparable Rentals",
      href: comparableRentalsHref,
    },
    { id: "uag", label: "Under Agreement", href: uagHref },
    { id: "history", label: "History", href: historyHref },
    { id: "if", label: "If...", href: ifHref },
  ];

  const tabsRow = (
    <div
      className={`flex flex-wrap items-center gap-x-4 border-b border-white/10 -mx-1 ${
        compact ? "gap-y-2" : "gap-y-3"
      }`}
    >
      <nav className="flex gap-1" aria-label="Listing sections">
        {tabs.map((tab) => {
          const isActive = active === tab.id;
          return (
            <Link
              key={tab.id}
              href={tab.href}
              className={`px-4 font-mono text-[10px] tracking-[0.15em] uppercase transition-colors border-b-2 -mb-px ${
                compact ? "py-2" : "py-2.5"
              } ${
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
    </div>
  );

  if (bare) return tabsRow;

  return (
    <div
      className={
        embedded
          ? compact
            ? "mt-3 pt-3 border-t border-white/10"
            : "mt-6 pt-6 border-t border-white/10"
          : `${listingRegionOutlineClass} mb-8`
      }
    >
      {tabsRow}
    </div>
  );
}
