"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
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

type TabDef = { id: ListingTab; label: string; href: string };

const ANALYSIS_TAB_IDS: ListingTab[] = ["history", "if"];

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
  const stripRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const activeTabRef = useRef<HTMLAnchorElement>(null);
  const [splitAnalysisRow, setSplitAnalysisRow] = useState(false);

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
  const primaryTabs = tabs.filter((tab) => !ANALYSIS_TAB_IDS.includes(tab.id));
  const analysisTabs = tabs.filter((tab) => ANALYSIS_TAB_IDS.includes(tab.id));
  const useSplitRow = inComparablesContext && splitAnalysisRow;

  // On mobile, while the Comparables cluster is open, tuck History and If onto a
  // second row only when the full strip would overflow the viewport.
  useEffect(() => {
    if (!inComparablesContext) {
      setSplitAnalysisRow(false);
      return;
    }

    const mq = window.matchMedia("(max-width: 767px)");

    const measure = () => {
      if (!mq.matches) {
        setSplitAnalysisRow(false);
        return;
      }
      const viewport = viewportRef.current;
      const measureStrip = measureRef.current;
      if (!viewport || !measureStrip) return;
      setSplitAnalysisRow(measureStrip.scrollWidth > viewport.clientWidth + 1);
    };

    measure();
    const ro = new ResizeObserver(measure);
    if (viewportRef.current) ro.observe(viewportRef.current);
    if (measureRef.current) ro.observe(measureRef.current);
    mq.addEventListener("change", measure);
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      mq.removeEventListener("change", measure);
      window.removeEventListener("resize", measure);
    };
  }, [active, tabs, inComparablesContext]);

  // No scrollbar: the strip is clipped and slid via transform. When the active
  // tab changes (after tapping a tab), the strip glides so the active tab is
  // centered — moving roughly one tab at a time as you step across the tabs.
  useEffect(() => {
    if (useSplitRow) return;
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
  }, [active, useSplitRow, tabs]);

  const tabLinkClass = (isActive: boolean) =>
    `shrink-0 whitespace-nowrap px-4 font-mono text-[10px] tracking-[0.15em] uppercase transition-colors border-b-2 -mb-px ${
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

  const renderTabLink = (tab: TabDef, attachActiveRef = true) => {
    const isActive = active === tab.id;
    return (
      <Link
        key={tab.id}
        ref={isActive && attachActiveRef ? activeTabRef : undefined}
        href={tab.href}
        className={tabLinkClass(isActive)}
        aria-current={isActive ? "page" : undefined}
      >
        {tab.label}
      </Link>
    );
  };

  const tabsRow = (
    <div className="relative border-b border-white/10">
      {/* Hidden measurer — same single-row width as the live strip. */}
      {inComparablesContext ? (
        <div
          ref={measureRef}
          className="pointer-events-none invisible absolute flex h-0 flex-nowrap gap-1 overflow-hidden"
          aria-hidden
        >
          {renderOverviewBackLink()}
          {tabs.map((tab) => renderTabLink(tab, false))}
        </div>
      ) : null}

      {useSplitRow ? (
        <div ref={viewportRef}>
          <nav
            className="relative flex flex-nowrap gap-1 border-b border-white/10"
            aria-label="Listing sections"
          >
            {inComparablesContext ? renderOverviewBackLink() : null}
            {primaryTabs.map((tab) => renderTabLink(tab))}
          </nav>
          <nav
            className="relative flex flex-nowrap gap-1"
            aria-label="Listing analysis sections"
          >
            {analysisTabs.map((tab) => renderTabLink(tab))}
          </nav>
        </div>
      ) : (
        <div ref={viewportRef} className="overflow-hidden">
          <nav
            ref={stripRef}
            className="relative flex flex-nowrap gap-1 transition-transform duration-300 ease-out"
            aria-label="Listing sections"
          >
            {inComparablesContext ? renderOverviewBackLink() : null}
            {tabs.map((tab) => renderTabLink(tab))}
          </nav>
        </div>
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
