"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { listingRegionOutlineClass } from "@/components/listing/listing-frame";
import { listingSectionHref } from "@/lib/listing-url";
import { spotlightSectionHref } from "@/lib/spotlight-url";
import { warmListingTabs } from "@/lib/warm-listing-cache";
import {
  parseSpotlightPropertyTab,
  spotlightPropertySearchParam,
} from "@/lib/spotlight-listing";

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

/** Always on the first row. */
const TOP_ROW_IDS: ListingTab[] = ["overview", "history", "if", "photos"];
/** Second row — Sales / Rentals. */
const COMPS_ROW_IDS: ListingTab[] = ["comparables", "comparable-rentals"];
/** Third row — Under Agreement (always its own line when stacked). */
const UAG_ROW_IDS: ListingTab[] = ["uag"];

function tabVisible(active: ListingTab, tabId: ListingTab): boolean {
  // Photos tab only while on the photos page; every other section tab stays visible
  // on load (Sales, Rentals, Under Agreement included).
  if (tabId === "photos") return active === "photos";
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
  const router = useRouter();
  const viewportRef = useRef<HTMLDivElement>(null);
  const measureFullRef = useRef<HTMLDivElement>(null);
  const [stackRows, setStackRows] = useState(false);

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
    { id: "comparables", label: "Sales", href: sectionHref("comparables") },
    {
      id: "comparable-rentals",
      label: "Rentals",
      href: sectionHref("comparable-rentals"),
    },
    { id: "uag", label: "Under Agreement", href: sectionHref("uag") },
    { id: "history", label: "History", href: sectionHref("history") },
    { id: "if", label: "What if", href: sectionHref("if") },
  ];
  const tabs = allTabs.filter((tab) => tabVisible(active, tab.id));
  const topTabs = tabs.filter((tab) => TOP_ROW_IDS.includes(tab.id));
  const compsTabs = tabs.filter((tab) => COMPS_ROW_IDS.includes(tab.id));
  const uagTabs = tabs.filter((tab) => UAG_ROW_IDS.includes(tab.id));

  // Prefetch Next.js tab routes + API JSON as soon as any tab of this property
  // mounts, so the next click is a cache hit (browser + Postgres warm).
  useEffect(() => {
    for (const tab of allTabs) {
      if (tab.id === "photos" && active !== "photos") continue;
      router.prefetch(tab.href);
    }
    const propertyTab = parseSpotlightPropertyTab(searchParams.get("property"));
    warmListingTabs(mlsId, {
      routeBase,
      townHint,
      propertyParam:
        routeBase === "spotlight"
          ? spotlightPropertySearchParam(propertyTab)
          : null,
    });
    // allTabs hrefs are derived from mlsId / routeBase / hints / search — listed deps cover that.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: warm once per property surface
  }, [mlsId, routeBase, townHint, router, searchParams, active]);

  useEffect(() => {
    const measure = () => {
      const viewport = viewportRef.current;
      const fullStrip = measureFullRef.current;
      if (!viewport || !fullStrip) return;
      setStackRows(fullStrip.scrollWidth > viewport.clientWidth + 1);
    };

    measure();
    const ro = new ResizeObserver(measure);
    if (viewportRef.current) ro.observe(viewportRef.current);
    if (measureFullRef.current) ro.observe(measureFullRef.current);
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [active, tabs]);

  const tabLinkClass = (isActive: boolean) =>
    `shrink-0 whitespace-nowrap px-3 sm:px-4 font-mono text-[10px] tracking-[0.15em] uppercase transition-colors border-b-2 -mb-px ${
      compact ? "py-2" : "py-2.5"
    } ${
      isActive
        ? "text-gold border-gold"
        : "text-white/50 border-transparent hover:text-white/80"
    }`;

  const renderTabLink = (tab: TabDef, keyPrefix = "") => {
    const isActive = active === tab.id;
    return (
      <Link
        key={`${keyPrefix}${tab.id}`}
        href={tab.href}
        className={tabLinkClass(isActive)}
        aria-current={isActive ? "page" : undefined}
      >
        {tab.label}
      </Link>
    );
  };

  const singleRowTabs = [...topTabs, ...compsTabs, ...uagTabs];

  const tabsRow = (
    <div ref={viewportRef} className="relative border-b border-white/10">
      {/* Full single-row width — if it overflows, use 3 stacked rows. */}
      <div
        ref={measureFullRef}
        className="pointer-events-none invisible absolute flex h-0 flex-nowrap gap-x-1 overflow-hidden"
        aria-hidden
      >
        {singleRowTabs.map((tab) => renderTabLink(tab, "mf-"))}
      </div>

      {stackRows ? (
        <>
          <nav
            className="relative flex flex-nowrap gap-x-1 border-b border-white/10"
            aria-label="Listing sections"
          >
            {topTabs.map((tab) => renderTabLink(tab))}
          </nav>
          <nav
            className="relative flex flex-nowrap gap-x-1 border-b border-white/10"
            aria-label="Sales and rentals"
          >
            {compsTabs.map((tab) => renderTabLink(tab))}
          </nav>
          {uagTabs.length > 0 ? (
            <nav
              className="relative flex flex-nowrap gap-x-1"
              aria-label="Under Agreement"
            >
              {uagTabs.map((tab) => renderTabLink(tab))}
            </nav>
          ) : null}
        </>
      ) : (
        <nav
          className="relative flex flex-nowrap gap-x-1"
          aria-label="Listing sections"
        >
          {singleRowTabs.map((tab) => renderTabLink(tab))}
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
