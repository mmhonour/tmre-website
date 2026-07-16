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

/** Always on the first row. */
const TOP_ROW_IDS: ListingTab[] = ["overview", "history", "if", "photos"];
/** Second row — Sales / Rentals under the Comparables: label. */
const COMPS_ROW_IDS: ListingTab[] = ["comparables", "comparable-rentals"];
/** Third row when Under Agreement cannot sit with Sales/Rentals. */
const UAG_ROW_IDS: ListingTab[] = ["uag"];

function isComparablesContext(active: ListingTab): boolean {
  return (
    active === "comparables" ||
    active === "comparable-rentals" ||
    active === "uag"
  );
}

function tabVisible(active: ListingTab, tabId: ListingTab): boolean {
  if (tabId === "photos") return active === "photos";
  // Overview / History / What if stay visible in every section (including comps).
  if (tabId === "comparable-rentals" || tabId === "uag") {
    return isComparablesContext(active) || active === tabId;
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
  const measureFullRef = useRef<HTMLDivElement>(null);
  const measureCompsRef = useRef<HTMLDivElement>(null);
  const [stackCompsRow, setStackCompsRow] = useState(false);
  const [stackUagRow, setStackUagRow] = useState(false);

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
  const hasCompsCluster = compsTabs.length > 0 || uagTabs.length > 0;

  useEffect(() => {
    if (!hasCompsCluster) {
      setStackCompsRow(false);
      setStackUagRow(false);
      return;
    }

    const measure = () => {
      const viewport = viewportRef.current;
      const fullStrip = measureFullRef.current;
      const compsStrip = measureCompsRef.current;
      if (!viewport || !fullStrip) return;

      const needCompsRow = fullStrip.scrollWidth > viewport.clientWidth + 1;
      setStackCompsRow(needCompsRow);

      // Under Agreement gets its own line only when the comps cluster itself
      // overflows (Sales + Rentals + Under Agreement, with the Comparables: label).
      if (needCompsRow && uagTabs.length > 0 && compsStrip) {
        setStackUagRow(compsStrip.scrollWidth > viewport.clientWidth + 1);
      } else {
        setStackUagRow(false);
      }
    };

    measure();
    const ro = new ResizeObserver(measure);
    if (viewportRef.current) ro.observe(viewportRef.current);
    if (measureFullRef.current) ro.observe(measureFullRef.current);
    if (measureCompsRef.current) ro.observe(measureCompsRef.current);
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [active, tabs, hasCompsCluster, uagTabs.length]);

  const tabLinkClass = (isActive: boolean) =>
    `shrink-0 whitespace-nowrap px-3 sm:px-4 font-mono text-[10px] tracking-[0.15em] uppercase transition-colors border-b-2 -mb-px ${
      compact ? "py-2" : "py-2.5"
    } ${
      isActive
        ? "text-gold border-gold"
        : "text-white/50 border-transparent hover:text-white/80"
    }`;

  const compsLabelClass = `shrink-0 whitespace-nowrap px-3 sm:px-4 font-mono text-[10px] tracking-[0.15em] uppercase text-white/40 border-b-2 border-transparent -mb-px ${
    compact ? "py-2" : "py-2.5"
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

  const renderCompsLabel = (key: string) => (
    <span key={key} className={compsLabelClass} aria-hidden={key.startsWith("m-")}>
      Comparables:
    </span>
  );

  /** Sales + Rentals (+ optional Under Agreement) with the Comparables: prefix. */
  const renderCompsCluster = (
    includeUag: boolean,
    keyPrefix: string,
  ) => (
    <>
      {renderCompsLabel(`${keyPrefix}label`)}
      {compsTabs.map((tab) => renderTabLink(tab, keyPrefix))}
      {includeUag ? uagTabs.map((tab) => renderTabLink(tab, keyPrefix)) : null}
    </>
  );

  const tabsRow = (
    <div ref={viewportRef} className="relative border-b border-white/10">
      {/* Full single-row width (all tabs) — decide whether to pull comps onto row 2. */}
      {hasCompsCluster ? (
        <div
          ref={measureFullRef}
          className="pointer-events-none invisible absolute flex h-0 flex-nowrap gap-x-1 overflow-hidden"
          aria-hidden
        >
          {topTabs.map((tab) => renderTabLink(tab, "mf-"))}
          {renderCompsCluster(true, "mf-")}
        </div>
      ) : null}

      {/* Comps cluster width alone — decide whether Under Agreement needs row 3. */}
      {hasCompsCluster && uagTabs.length > 0 ? (
        <div
          ref={measureCompsRef}
          className="pointer-events-none invisible absolute flex h-0 flex-nowrap gap-x-1 overflow-hidden"
          aria-hidden
        >
          {renderCompsCluster(true, "mc-")}
        </div>
      ) : null}

      {stackCompsRow ? (
        <>
          <nav
            className="relative flex flex-nowrap gap-x-1 border-b border-white/10"
            aria-label="Listing sections"
          >
            {topTabs.map((tab) => renderTabLink(tab))}
          </nav>
          <nav
            className={`relative flex flex-nowrap gap-x-1 ${
              stackUagRow ? "border-b border-white/10" : ""
            }`}
            aria-label="Comparables sections"
          >
            {renderCompsCluster(!stackUagRow, "")}
          </nav>
          {stackUagRow ? (
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
          {topTabs.map((tab) => renderTabLink(tab))}
          {hasCompsCluster ? renderCompsCluster(true, "") : null}
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
