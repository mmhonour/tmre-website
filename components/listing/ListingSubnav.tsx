"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
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

/** Hide the native scrollbar while keeping touch/trackpad scroll. */
const scrollStripClass =
  "flex flex-nowrap gap-1 overflow-x-auto overscroll-x-contain [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden touch-pan-x";

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
  const activeTabRef = useRef<HTMLAnchorElement>(null);
  const [splitAnalysisRow, setSplitAnalysisRow] = useState(false);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

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

  const updateScrollCues = useCallback(() => {
    const el = viewportRef.current;
    if (!el) {
      setCanScrollLeft(false);
      setCanScrollRight(false);
      return;
    }
    const max = el.scrollWidth - el.clientWidth;
    if (max <= 2) {
      setCanScrollLeft(false);
      setCanScrollRight(false);
      return;
    }
    setCanScrollLeft(el.scrollLeft > 2);
    setCanScrollRight(el.scrollLeft < max - 2);
  }, []);

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

  // Independent horizontal scroll (no visible scrollbar). Fade/chevron cues show
  // when more tabs exist off-screen. Active tab scrolls into view on change.
  useEffect(() => {
    if (useSplitRow) {
      setCanScrollLeft(false);
      setCanScrollRight(false);
      return;
    }
    const viewport = viewportRef.current;
    if (!viewport) return;

    const scrollActiveIntoView = () => {
      const el = activeTabRef.current;
      if (!el) return;
      const left =
        el.offsetLeft - (viewport.clientWidth - el.clientWidth) / 2;
      viewport.scrollTo({
        left: Math.max(0, left),
        behavior: "smooth",
      });
    };

    updateScrollCues();
    // Center after layout settles (fonts / split-measure).
    const t = window.setTimeout(() => {
      scrollActiveIntoView();
      updateScrollCues();
    }, 0);

    viewport.addEventListener("scroll", updateScrollCues, { passive: true });
    const ro = new ResizeObserver(updateScrollCues);
    ro.observe(viewport);
    window.addEventListener("resize", updateScrollCues);

    return () => {
      window.clearTimeout(t);
      viewport.removeEventListener("scroll", updateScrollCues);
      ro.disconnect();
      window.removeEventListener("resize", updateScrollCues);
    };
  }, [active, useSplitRow, tabs, updateScrollCues]);

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

  const scrollCues = !useSplitRow ? (
    <>
      <div
        aria-hidden
        className={`pointer-events-none absolute inset-y-0 left-0 z-10 w-10 bg-gradient-to-r from-navy via-navy/80 to-transparent transition-opacity duration-200 ${
          canScrollLeft ? "opacity-100" : "opacity-0"
        }`}
      />
      <div
        aria-hidden
        className={`pointer-events-none absolute inset-y-0 right-0 z-10 flex w-12 items-center justify-end bg-gradient-to-l from-navy via-navy/85 to-transparent pl-4 transition-opacity duration-200 ${
          canScrollRight ? "opacity-100" : "opacity-0"
        }`}
      >
        <span className="mr-1.5 font-mono text-[11px] tracking-widest text-gold/90">
          ››
        </span>
      </div>
      {canScrollRight || canScrollLeft ? (
        <p className="sr-only">
          Swipe left or right to see more listing sections.
        </p>
      ) : null}
    </>
  ) : null;

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
        <div className="relative">
          {scrollCues}
          <nav
            ref={viewportRef}
            className={scrollStripClass}
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
