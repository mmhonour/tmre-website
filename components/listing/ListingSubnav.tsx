"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { listingRegionOutlineClass } from "@/components/listing/listing-frame";
import {
  LISTING_RECENTLY_RENTED_PANEL_ID,
  LISTING_RECENTLY_SOLD_PANEL_ID,
  LISTING_SECTION_IDS,
  listingRecentlyClosedPanelIdForTab,
  listingSectionIdForTab,
  listingTabFromSectionId,
} from "@/components/listing/listing-section-ids";
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
/** Second row — Sold / Rented. */
const COMPS_ROW_IDS: ListingTab[] = ["comparables", "comparable-rentals"];
/** Third row — Under Agreement (always its own line when stacked). */
const UAG_ROW_IDS: ListingTab[] = ["uag"];

const HASH_JUMP_TABS = new Set<ListingTab>([
  "overview",
  "history",
  "if",
  "comparables",
  "comparable-rentals",
  "uag",
]);

function tabVisible(
  active: ListingTab,
  tabId: ListingTab,
  alwaysShowPhotos: boolean,
): boolean {
  // Photos tab only while on the photos page; every other section tab stays visible
  // on load (Sales, Rentals, Under Agreement included). Local mockups keep Photos visible.
  if (tabId === "photos") return alwaysShowPhotos || active === "photos";
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
  onTabSelect = null,
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
  /**
   * When set, tab clicks stay on the current page and call this instead of
   * navigating to listing/spotlight routes (used by `/test` split mockup).
   */
  onTabSelect?: ((tab: ListingTab) => void) | null;
}) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const viewportRef = useRef<HTMLDivElement>(null);
  const measureFullRef = useRef<HTMLDivElement>(null);
  const [stackRows, setStackRows] = useState(false);
  const [scrollActive, setScrollActive] = useState<ListingTab | null>(null);
  /**
   * In-page section jumps on Overview (all viewports). Avoids remounting the
   * listing/Spotlight chrome when switching History / Sold / What if / etc.
   * Photos stays a real route. Dedicated tab URLs still work as deep links.
   */
  const useHashJump = !onTabSelect;

  const extra = new URLSearchParams(searchParams.toString());
  extra.delete("address");
  extra.delete("city");
  const extraQs = extra.toString();

  const routeHref = (section: ListingTab) => {
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

  const sectionHref = (section: ListingTab) => {
    // Sold / Rented always deep-link to the Recently Sold / Recently Rented panel.
    const recentlyClosedId = listingRecentlyClosedPanelIdForTab(section);
    if (recentlyClosedId) {
      if (useHashJump) {
        const overview = routeHref("overview");
        const hash = `#${recentlyClosedId}`;
        return overview.includes("#")
          ? `${overview.replace(/#.*$/, "")}${hash}`
          : `${overview}${hash}`;
      }
      const base = routeHref(section);
      return base.includes("#")
        ? `${base.replace(/#.*$/, "")}#${recentlyClosedId}`
        : `${base}#${recentlyClosedId}`;
    }

    if (!useHashJump || !HASH_JUMP_TABS.has(section)) {
      return routeHref(section);
    }
    const sectionId = listingSectionIdForTab(section);
    if (!sectionId) return routeHref(section);
    const overview = routeHref("overview");
    const hash = `#${sectionId}`;
    return overview.includes("#")
      ? `${overview.replace(/#.*$/, "")}${hash}`
      : `${overview}${hash}`;
  };

  const allTabs: TabDef[] = [
    { id: "overview", label: "Overview", href: sectionHref("overview") },
    { id: "photos", label: "Photos", href: sectionHref("photos") },
    { id: "comparables", label: "Sold", href: sectionHref("comparables") },
    {
      id: "comparable-rentals",
      label: "Rented",
      href: sectionHref("comparable-rentals"),
    },
    { id: "uag", label: "Under Agreement", href: sectionHref("uag") },
    { id: "history", label: "History", href: sectionHref("history") },
    { id: "if", label: "What if", href: sectionHref("if") },
  ];
  const tabs = allTabs.filter((tab) =>
    tabVisible(active, tab.id, Boolean(onTabSelect)),
  );
  const topTabs = tabs.filter((tab) => TOP_ROW_IDS.includes(tab.id));
  const compsTabs = tabs.filter((tab) => COMPS_ROW_IDS.includes(tab.id));
  const uagTabs = tabs.filter((tab) => UAG_ROW_IDS.includes(tab.id));

  // Prefetch Next.js tab routes + API JSON as soon as any tab of this property
  // mounts, so the next click is a cache hit (browser + Postgres warm).
  useEffect(() => {
    for (const tab of allTabs) {
      if (tab.id === "photos" && active !== "photos") continue;
      // Prefetch the real route even when the visible href is a hash jump.
      router.prefetch(routeHref(tab.id));
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

  // On overview, highlight the section in view / from the hash.
  useEffect(() => {
    if (!useHashJump || active !== "overview") {
      setScrollActive(null);
      return;
    }

    const syncFromHash = () => {
      const id = window.location.hash.replace(/^#/, "");
      const tab = id ? listingTabFromSectionId(id) : "overview";
      setScrollActive(tab ?? "overview");
    };
    syncFromHash();
    window.addEventListener("hashchange", syncFromHash);

    const ratios = new Map<string, number>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          ratios.set(entry.target.id, entry.intersectionRatio);
        }
        let bestId: string | null = null;
        let bestRatio = 0;
        for (const [id, ratio] of ratios) {
          if (ratio > bestRatio) {
            bestRatio = ratio;
            bestId = id;
          }
        }
        if (bestId && bestRatio > 0.12) {
          const tab = listingTabFromSectionId(bestId);
          if (tab) setScrollActive(tab);
        }
      },
      {
        root: null,
        rootMargin: "-20% 0px -55% 0px",
        threshold: [0, 0.15, 0.35, 0.55],
      },
    );

    // Sections mount lazily — keep trying briefly so the observer attaches.
    let cancelled = false;
    const observed = new Set<string>();
    const tryObserve = () => {
      if (cancelled) return;
      const anchorIds = [
        ...Object.values(LISTING_SECTION_IDS),
        LISTING_RECENTLY_SOLD_PANEL_ID,
        LISTING_RECENTLY_RENTED_PANEL_ID,
      ];
      for (const id of anchorIds) {
        if (observed.has(id)) continue;
        const el = document.getElementById(id);
        if (!el) continue;
        observer.observe(el);
        observed.add(id);
      }
    };
    tryObserve();
    const poll = window.setInterval(tryObserve, 200);
    const stopPoll = window.setTimeout(() => window.clearInterval(poll), 8000);

    return () => {
      cancelled = true;
      window.removeEventListener("hashchange", syncFromHash);
      window.clearInterval(poll);
      window.clearTimeout(stopPoll);
      observer.disconnect();
    };
  }, [useHashJump, active, mlsId]);

  const tabLinkClass = (isActive: boolean) =>
    `shrink-0 whitespace-nowrap px-2.5 sm:px-3.5 font-mono text-[10px] tracking-[0.15em] uppercase transition-colors border-b-2 -mb-px ${
      compact ? "py-1" : "py-2"
    } ${
      isActive
        ? "text-gold border-gold"
        : "text-white/50 border-transparent hover:text-white/80"
    }`;

  const jumpToAnchor = (tab: ListingTab, anchorId: string) => {
    const el = document.getElementById(anchorId);
    if (!el) return false;
    el.scrollIntoView({ behavior: "smooth", block: "start" });
    const url = new URL(window.location.href);
    window.history.replaceState(
      null,
      "",
      `${url.pathname}${url.search}#${anchorId}`,
    );
    setScrollActive(tab);
    return true;
  };

  const jumpToSection = (tab: ListingTab) => {
    const recentlyClosedId = listingRecentlyClosedPanelIdForTab(tab);
    if (recentlyClosedId && jumpToAnchor(tab, recentlyClosedId)) return true;
    const sectionId = listingSectionIdForTab(tab);
    if (!sectionId) return false;
    return jumpToAnchor(tab, sectionId);
  };

  const renderTabLink = (tab: TabDef, keyPrefix = "") => {
    const highlighted =
      !onTabSelect && useHashJump && active === "overview" && scrollActive
        ? scrollActive === tab.id
        : active === tab.id;
    return (
      <Link
        key={`${keyPrefix}${tab.id}`}
        href={tab.href}
        className={tabLinkClass(highlighted)}
        aria-current={highlighted ? "page" : undefined}
        onClick={(event) => {
          if (onTabSelect) {
            event.preventDefault();
            onTabSelect(tab.id);
            return;
          }
          // Sold / Rented: if the Recently Sold/Rented panel is already on the
          // page (overview stack or the Sold/Rented tab), scroll to it in place.
          const recentlyClosedId = listingRecentlyClosedPanelIdForTab(tab.id);
          if (recentlyClosedId && jumpToAnchor(tab.id, recentlyClosedId)) {
            event.preventDefault();
            return;
          }
          if (!useHashJump || !HASH_JUMP_TABS.has(tab.id)) return;
          // Already on overview with sections mounted — smooth-scroll in place.
          if (active === "overview" && jumpToSection(tab.id)) {
            event.preventDefault();
          }
        }}
      >
        {tab.label}
      </Link>
    );
  };

  /** Non-link italic "or" between Sold / Rented. */
  const compsMutedOr = (key: string, keyPrefix = "") => (
    <span
      key={`${keyPrefix}${key}`}
      className={`shrink-0 whitespace-nowrap font-mono text-[10px] tracking-[0.15em] italic lowercase text-white/35 border-b-2 border-transparent -mb-px pointer-events-none select-none px-1 ${
        compact ? "py-1" : "py-2"
      }`}
      aria-hidden
    >
      or
    </span>
  );

  /** Sold or Rented. */
  const renderCompsTabs = (keyPrefix = "") => {
    const items = compsTabs.filter(
      (tab) =>
        tab.id === "comparables" || tab.id === "comparable-rentals",
    );
    if (items.length === 0) return null;
    return (
      <>
        {items.map((tab, index) => (
          <span key={`${keyPrefix}${tab.id}-wrap`} className="contents">
            {index > 0 ? compsMutedOr(`or-${index}`, keyPrefix) : null}
            {renderTabLink(tab, keyPrefix)}
          </span>
        ))}
      </>
    );
  };

  const tabsRow = (
    <div ref={viewportRef} className="relative border-b border-white/10">
      {/* Full single-row width — if it overflows, use 3 stacked rows. */}
      <div
        ref={measureFullRef}
        className="pointer-events-none invisible absolute flex h-0 flex-nowrap gap-x-1 overflow-hidden"
        aria-hidden
      >
        {topTabs.map((tab) => renderTabLink(tab, "mf-"))}
        {renderCompsTabs("mf-")}
        {uagTabs.map((tab) => renderTabLink(tab, "mf-"))}
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
            aria-label="Sold and rented"
          >
            {renderCompsTabs("")}
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
          {topTabs.map((tab) => renderTabLink(tab))}
          {renderCompsTabs("")}
          {uagTabs.map((tab) => renderTabLink(tab))}
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
            ? // Tight gap under Style meta → first tab row.
              "mt-0.5 pt-1 border-t border-white/10"
            : "mt-6 pt-6 border-t border-white/10"
          : `${listingRegionOutlineClass} mb-8`
      }
    >
      {tabsRow}
    </div>
  );
}
