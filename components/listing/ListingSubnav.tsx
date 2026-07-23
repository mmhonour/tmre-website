"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { listingRegionOutlineClass } from "@/components/listing/listing-frame";
import {
  LISTING_RECENTLY_RENTED_PANEL_ID,
  LISTING_RECENTLY_SOLD_PANEL_ID,
  LISTING_SECTION_IDS,
  listingSectionIdForTab,
  listingTabFromSectionId,
  type ListingScrollSectionTab,
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
  | "map"
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

/**
 * Canonical tab order (listing + Spotlight).
 * Overview → Photos → (Transactions) → Sold → Rented → Under Agreement → What if → History → Map
 * Sold / Rented / Under Agreement stay collapsed behind the Transactions control
 * until that control is opened (or one of those tabs is already active).
 */
const TAB_ORDER: ListingTab[] = [
  "overview",
  "photos",
  "comparables",
  "comparable-rentals",
  "uag",
  "if",
  "history",
  "map",
];

/** When the strip overflows, wrap into these rows (same overall order). */
const STACK_ROWS: ListingTab[][] = [
  ["overview", "photos"],
  ["comparables", "comparable-rentals", "uag"],
  ["if", "history", "map"],
];

const TRANSACTION_TABS = new Set<ListingTab>([
  "comparables",
  "comparable-rentals",
  "uag",
]);

const HASH_JUMP_TABS = new Set<ListingTab>([
  "overview",
  "history",
  "if",
  "comparables",
  "comparable-rentals",
  "uag",
]);

const PANEL_SECTION_TABS = new Set<ListingTab>([
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
  showTransactionTabs: boolean,
): boolean {
  // Photos tab only after the user clicks a photo on Overview (photos mode),
  // while on the dedicated photos page, or on local mockups that always show it.
  if (tabId === "photos") return alwaysShowPhotos || active === "photos";
  if (TRANSACTION_TABS.has(tabId)) return showTransactionTabs;
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
  panelTab = null,
  onPanelOpen = null,
  onPanelClose = null,
  forceShowPhotos = false,
  mapVisible = false,
  onMapToggle = null,
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
  /**
   * Slide-up panel mode (listing / Spotlight overview): which section is open,
   * or null when the panel is collapsed over the hero.
   */
  panelTab?: ListingScrollSectionTab | null;
  /** Open / switch the slide-up panel to this section tab. */
  onPanelOpen?: ((tab: ListingScrollSectionTab) => void) | null;
  /** Collapse the slide-up panel (Photos tab while panel is open). */
  onPanelClose?: (() => void) | null;
  /** Force Photos tab visible (panel open). */
  forceShowPhotos?: boolean;
  /** Location panel is open (Map tab highlight). */
  mapVisible?: boolean;
  /** Toggle Location panel without opening slide content. */
  onMapToggle?: (() => void) | null;
}) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const viewportRef = useRef<HTMLDivElement>(null);
  const measureFullRef = useRef<HTMLDivElement>(null);
  const [stackRows, setStackRows] = useState(false);
  const [scrollActive, setScrollActive] = useState<ListingTab | null>(null);
  /** Reveals Sold / Rented / Under Agreement; hides the Transactions control. */
  const [transactionsOpen, setTransactionsOpen] = useState(false);

  const panelMode = Boolean(onPanelOpen && onPanelClose);
  /**
   * Legacy in-page hash jumps when not using the slide-up panel or onTabSelect.
   */
  const useHashJump = !onTabSelect && !panelMode;
  const showPhotosTab = forceShowPhotos || Boolean(onTabSelect);

  const transactionContext =
    TRANSACTION_TABS.has(active) ||
    (panelTab != null && TRANSACTION_TABS.has(panelTab)) ||
    (scrollActive != null && TRANSACTION_TABS.has(scrollActive));
  const showTransactionTabs = transactionsOpen || transactionContext;

  useEffect(() => {
    if (transactionContext) setTransactionsOpen(true);
  }, [transactionContext]);

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
    // Sold / Rented land on the section label (SOLD / RENTED), not the inner
    // Recently sold/rented panel under the Green = exact match legend.
    if (panelMode && PANEL_SECTION_TABS.has(section)) {
      const sectionId = listingSectionIdForTab(section);
      const overview = routeHref("overview");
      if (!sectionId) return overview;
      const hash = `#${sectionId}`;
      return overview.includes("#")
        ? `${overview.replace(/#.*$/, "")}${hash}`
        : `${overview}${hash}`;
    }

    if (section === "map") {
      const overview = routeHref("overview");
      const hash = "#listing-location";
      return overview.includes("#")
        ? `${overview.replace(/#.*$/, "")}${hash}`
        : `${overview}${hash}`;
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
    { id: "if", label: "What if", href: sectionHref("if") },
    { id: "history", label: "History", href: sectionHref("history") },
    { id: "map", label: "Map", href: sectionHref("map") },
  ];
  const tabsById = new Map(
    allTabs
      .filter((tab) =>
        tabVisible(active, tab.id, showPhotosTab, showTransactionTabs),
      )
      .map((tab) => [tab.id, tab]),
  );
  const tabs = TAB_ORDER.map((id) => tabsById.get(id)).filter(
    (tab): tab is TabDef => tab != null,
  );

  // Prefetch Next.js tab routes + API JSON as soon as any tab of this property
  // mounts, so the next click is a cache hit (browser + Postgres warm).
  useEffect(() => {
    for (const tab of allTabs) {
      if (tab.id === "map") continue;
      if (tab.id === "photos" && active !== "photos" && !forceShowPhotos) {
        continue;
      }
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: warm once per property surface
  }, [mlsId, routeBase, townHint, router, searchParams, active, forceShowPhotos]);

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
  }, [active, tabs, forceShowPhotos, panelTab, showTransactionTabs]);

  // Legacy stack mode: highlight the section in view / from the hash.
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
    const sectionId = listingSectionIdForTab(tab);
    if (!sectionId) return false;
    return jumpToAnchor(tab, sectionId);
  };

  const noteNonTransactionTab = (tabId: ListingTab) => {
    if (!TRANSACTION_TABS.has(tabId)) setTransactionsOpen(false);
  };

  const renderTransactionsControl = (keyPrefix = "") => (
    <button
      key={`${keyPrefix}transactions`}
      type="button"
      className={tabLinkClass(false)}
      aria-expanded={false}
      aria-controls="listing-transaction-tabs"
      onClick={() => setTransactionsOpen(true)}
    >
      Transactions
    </button>
  );

  const renderTabLink = (tab: TabDef, keyPrefix = "") => {
    const highlighted =
      tab.id === "map"
        ? mapVisible
        : panelMode
          ? panelTab === tab.id
          : !onTabSelect && useHashJump && active === "overview" && scrollActive
            ? scrollActive === tab.id
            : active === tab.id;
    return (
      <Link
        key={`${keyPrefix}${tab.id}`}
        href={tab.href}
        className={tabLinkClass(highlighted)}
        aria-current={highlighted ? "page" : undefined}
        onClick={(event) => {
          noteNonTransactionTab(tab.id);

          if (tab.id === "map") {
            event.preventDefault();
            onMapToggle?.();
            return;
          }

          if (onTabSelect) {
            event.preventDefault();
            onTabSelect(tab.id);
            return;
          }

          if (panelMode && onPanelOpen && onPanelClose) {
            if (tab.id === "photos") {
              if (panelTab != null) {
                event.preventDefault();
                onPanelClose();
              }
              return;
            }
            if (PANEL_SECTION_TABS.has(tab.id)) {
              event.preventDefault();
              onPanelOpen(tab.id as ListingScrollSectionTab);
              return;
            }
          }

          if (!useHashJump || !HASH_JUMP_TABS.has(tab.id)) return;
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

  /**
   * Render tabs in order; insert Transactions after Photos when the Sold /
   * Rented / Under Agreement group is collapsed; insert muted "or" between
   * Sold and Rented when that group is open.
   */
  const renderOrderedTabs = (ids: ListingTab[], keyPrefix = "") => {
    const nodes: ReactNode[] = [];
    for (const id of ids) {
      if (id === "photos") {
        const photosTab = tabsById.get(id);
        if (photosTab) nodes.push(renderTabLink(photosTab, keyPrefix));
        if (!showTransactionTabs) {
          nodes.push(renderTransactionsControl(keyPrefix));
        }
        continue;
      }
      const tab = tabsById.get(id);
      if (!tab) continue;
      if (id === "comparable-rentals") {
        const soldVisible = tabsById.has("comparables");
        if (soldVisible) {
          nodes.push(compsMutedOr(`or-${id}`, keyPrefix));
        }
      }
      nodes.push(renderTabLink(tab, keyPrefix));
    }
    return nodes;
  };

  const visibleStackRows = STACK_ROWS.map((rowIds) =>
    rowIds.filter((id) => {
      // Keep the Photos slot so Transactions can still render after it when
      // the Photos tab itself is hidden.
      if (id === "photos") return true;
      return tabsById.has(id);
    }),
  ).filter((rowIds) =>
    rowIds.some((id) => {
      if (id === "photos") {
        return tabsById.has("photos") || !showTransactionTabs;
      }
      return tabsById.has(id);
    }),
  );

  const tabsRow = (
    <div ref={viewportRef} className="relative">
      {/* Full single-row width — if it overflows, use stacked rows. */}
      <div
        ref={measureFullRef}
        className="pointer-events-none invisible absolute flex h-0 flex-nowrap gap-x-1 overflow-hidden"
        aria-hidden
      >
        {renderOrderedTabs(TAB_ORDER, "mf-")}
      </div>

      {stackRows ? (
        <>
          {visibleStackRows.map((rowIds, rowIndex) => {
            const isTransactionRow = rowIds.some((id) =>
              TRANSACTION_TABS.has(id),
            );
            return (
              <nav
                key={`stack-row-${rowIndex}`}
                id={isTransactionRow ? "listing-transaction-tabs" : undefined}
                className={`relative flex flex-nowrap gap-x-1${
                  rowIndex < visibleStackRows.length - 1
                    ? " border-b border-white/10"
                    : ""
                }`}
                aria-label={
                  rowIndex === 0
                    ? "Listing sections"
                    : isTransactionRow
                      ? "Sold, rented, and under agreement"
                      : "What if, history, and map"
                }
              >
                {renderOrderedTabs(rowIds)}
              </nav>
            );
          })}
        </>
      ) : (
        <nav
          id={
            showTransactionTabs ? "listing-transaction-tabs" : undefined
          }
          className="relative flex flex-nowrap gap-x-1"
          aria-label="Listing sections"
        >
          {renderOrderedTabs(TAB_ORDER)}
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
            ? // Tight gap under Style meta → first tab row (no divider line).
              "mt-0.5 pt-1"
            : "mt-6 pt-6"
          : `${listingRegionOutlineClass} mb-8`
      }
    >
      {tabsRow}
    </div>
  );
}
