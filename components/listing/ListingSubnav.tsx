"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
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
  const viewportRef = useRef<HTMLDivElement>(null);
  const stripRef = useRef<HTMLDivElement>(null);
  const activeTabRef = useRef<HTMLAnchorElement>(null);

  // No scrollbar: the strip is clipped and slid via transform. When the active
  // tab changes (after tapping a tab), the strip glides so the active tab is
  // centered — moving roughly one tab at a time as you step across the tabs.
  useEffect(() => {
    const viewport = viewportRef.current;
    const strip = stripRef.current;
    const el = activeTabRef.current;
    if (!viewport || !strip || !el) return;
    const reposition = () => {
      const maxOffset = Math.max(0, strip.scrollWidth - viewport.clientWidth);
      const desired =
        el.offsetLeft + el.clientWidth / 2 - viewport.clientWidth / 2;
      const offset = Math.min(Math.max(0, desired), maxOffset);
      strip.style.transform = `translateX(${-offset}px)`;
    };
    reposition();
    window.addEventListener("resize", reposition);
    return () => window.removeEventListener("resize", reposition);
  }, [active]);

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

  const allTabs: { id: ListingTab; label: string; href: string }[] = [
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
  const tabs = allTabs.filter((tab) => {
    // Keep the tab row light (mobile-friendly) by revealing secondary tabs only
    // in context instead of using a horizontal scrollbar.
    // - Photos: only while it's active (revealed by clicking the hero image).
    // - Comparable Rentals: only while Comparables is active (its reveal), or
    //   while it's itself active (so the current tab never vanishes).
    if (tab.id === "photos") return active === "photos";
    if (tab.id === "comparable-rentals") {
      return active === "comparables" || active === "comparable-rentals";
    }
    return true;
  });

  const tabsRow = (
    <div ref={viewportRef} className="overflow-hidden border-b border-white/10">
      <nav
        ref={stripRef}
        className="relative flex flex-nowrap gap-1 transition-transform duration-300 ease-out"
        aria-label="Listing sections"
      >
        {tabs.map((tab) => {
          const isActive = active === tab.id;
          return (
            <Link
              key={tab.id}
              ref={isActive ? activeTabRef : undefined}
              href={tab.href}
              className={`shrink-0 whitespace-nowrap px-4 font-mono text-[10px] tracking-[0.15em] uppercase transition-colors border-b-2 -mb-px ${
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
