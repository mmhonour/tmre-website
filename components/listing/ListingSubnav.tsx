"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { listingRegionOutlineClass } from "@/components/listing/listing-frame";
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

type TabDef = { id: ListingTab; label: string; href: string };

/** Primary row when the strip must wrap (always visible / analysis). */
const TOP_ROW_IDS: ListingTab[] = ["overview", "history", "if", "photos"];
/** Second row — Comparables cluster alone. */
const BOTTOM_ROW_IDS: ListingTab[] = [
  "comparables",
  "comparable-rentals",
  "uag",
];

function isComparablesContext(active: ListingTab): boolean {
  return (
    active === "comparables" ||
    active === "comparable-rentals" ||
    active === "uag"
  );
}

function tabVisible(active: ListingTab, tabId: ListingTab): boolean {
  const inCompCtx = isComparablesContext(active);
  if (tabId === "photos") return active === "photos";
  if (inCompCtx && (tabId === "overview" || tabId === "history")) return false;
  if (tabId === "comparable-rentals" || tabId === "uag") {
    return inCompCtx || active === tabId;
  }
  return true;
}

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
  const measureRef = useRef<HTMLDivElement>(null);
  const [stackComparables, setStackComparables] = useState(false);

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

  const allTabs: TabDef[] = [
    { id: "overview", label: "Overview", href: sectionHref("overview") },
    { id: "photos", label: "Photos", href: sectionHref("photos") },
    { id: "comparables", label: "Comparables ...", href: sectionHref("comparables") },
    {
      id: "comparable-rentals",
      label: "Comparable Rentals",
      href: sectionHref("comparable-rentals"),
    },
    { id: "uag", label: "Under Agreement", href: sectionHref("uag") },
    { id: "history", label: "History", href: sectionHref("history") },
    { id: "if", label: "What if", href: sectionHref("if") },
  ];
  const tabs = allTabs.filter((tab) => tabVisible(active, tab.id));
  const inComparablesContext = isComparablesContext(active);
  const topTabs = tabs.filter((tab) => TOP_ROW_IDS.includes(tab.id));
  const bottomTabs = tabs.filter((tab) => BOTTOM_ROW_IDS.includes(tab.id));
  // Only stack when Comparables would sit on the second line (needs a bottom row).
  const canStack = bottomTabs.length > 0 && topTabs.length > 0;

  useEffect(() => {
    if (!canStack) {
      setStackComparables(false);
      return;
    }

    const measure = () => {
      const viewport = viewportRef.current;
      const measureStrip = measureRef.current;
      if (!viewport || !measureStrip) return;
      setStackComparables(measureStrip.scrollWidth > viewport.clientWidth + 1);
    };

    measure();
    const ro = new ResizeObserver(measure);
    if (viewportRef.current) ro.observe(viewportRef.current);
    if (measureRef.current) ro.observe(measureRef.current);
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [active, tabs, canStack, inComparablesContext]);

  const tabLinkClass = (isActive: boolean) =>
    `shrink-0 whitespace-nowrap px-3 sm:px-4 font-mono text-[10px] tracking-[0.15em] uppercase transition-colors border-b-2 -mb-px ${
      compact ? "py-2" : "py-2.5"
    } ${
      isActive
        ? "text-gold border-gold"
        : "text-white/50 border-transparent hover:text-white/80"
    }`;

  const renderOverviewBackLink = () => (
    <Link
      href={sectionHref("overview")}
      className={tabLinkClass(false)}
      aria-label="Back to overview"
    >
      <span className="inline-flex items-center gap-0.5">
        <span aria-hidden>←</span>
        <span>...</span>
      </span>
    </Link>
  );

  const renderTabLink = (tab: TabDef, attachKey = true) => {
    const isActive = active === tab.id;
    return (
      <Link
        key={attachKey ? tab.id : `measure-${tab.id}`}
        href={tab.href}
        className={tabLinkClass(isActive)}
        aria-current={isActive ? "page" : undefined}
      >
        {tab.label}
      </Link>
    );
  };

  const tabsRow = (
    <div ref={viewportRef} className="relative border-b border-white/10">
      {/* Hidden single-row measurer — natural tab order width. */}
      {canStack ? (
        <div
          ref={measureRef}
          className="pointer-events-none invisible absolute flex h-0 flex-nowrap gap-x-1 overflow-hidden"
          aria-hidden
        >
          {inComparablesContext ? renderOverviewBackLink() : null}
          {tabs.map((tab) => renderTabLink(tab, false))}
        </div>
      ) : null}

      {stackComparables ? (
        <>
          <nav
            className="relative flex flex-nowrap gap-x-1 border-b border-white/10"
            aria-label="Listing sections"
          >
            {inComparablesContext ? renderOverviewBackLink() : null}
            {topTabs.map((tab) => renderTabLink(tab))}
          </nav>
          <nav
            className="relative flex flex-nowrap gap-x-1"
            aria-label="Comparables sections"
          >
            {bottomTabs.map((tab) => renderTabLink(tab))}
          </nav>
        </>
      ) : (
        <nav
          className="relative flex flex-nowrap gap-x-1"
          aria-label="Listing sections"
        >
          {inComparablesContext ? renderOverviewBackLink() : null}
          {tabs.map((tab) => renderTabLink(tab))}
        </nav>
      )}
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
