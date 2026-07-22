"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import ListingHeader from "@/components/listing/ListingHeader";
import { ListingInsightCopy } from "@/components/listing/ListingInsightCopy";
import ListingLocationMap from "@/components/listing/ListingLocationMap";
import ListingSideDrawer from "@/components/listing/ListingSideDrawer";
import ListingSubnav, {
  type ListingInterestProps,
  type ListingTab,
} from "@/components/listing/ListingSubnav";
import {
  LISTING_SECTION_IDS,
  listingRecentlyClosedPanelIdForTab,
  listingSectionIdForTab,
  listingTabFromSectionId,
  type ListingScrollSectionTab,
} from "@/components/listing/listing-section-ids";
import { DealBoardStatusBadge } from "@/components/intelligence/deal-board/deal-board-shared";
import { listingPanelCompactClass } from "@/components/listing/listing-frame";
import ListingInterestButton from "@/components/listing/ListingInterestButton";
import { LISTING_CRITERIA_SLOT_ID } from "@/components/listing/ListingCriteriaSideLayout";
import { ListingCriteriaVisibilityProvider } from "@/components/listing/ListingCriteriaVisibilityContext";
import { ListingPhotosModeContext } from "@/components/listing/ListingPhotosModeContext";
import {
  firstListingRemarksLine,
} from "@/components/listing/ListingOverviewPanels";
import ListingRemarksSidePanel, {
  useListingRemarksExpand,
} from "@/components/listing/ListingRemarksSidePanel";
import { ListingBackLink } from "@/components/listing/ListingShell";
import { LISTING_ANALYSIS_ID } from "@/components/listing/ListingDetailsSchoolsPanel";
import { formatMlsStatus } from "@/lib/listing-history";
import {
  cloneElement,
  isValidElement,
  type ComponentProps,
  type ReactElement,
  type ReactNode,
} from "react";

type MobileDrawerId = "details" | null;

/** Clears the fixed site nav (`pt-20` / `lg:pt-24` on ListingShell). */
const STICKY_TOP_CLASS = "top-20 lg:top-24";

const PANEL_SECTION_TABS = new Set<string>([
  "overview",
  "history",
  "if",
  "comparables",
  "comparable-rentals",
  "uag",
]);

function tabFromLocationHash(): ListingScrollSectionTab | null {
  if (typeof window === "undefined") return null;
  const id = window.location.hash.replace(/^#/, "");
  if (!id) return null;
  const tab = listingTabFromSectionId(id);
  if (tab && PANEL_SECTION_TABS.has(tab)) return tab;
  return null;
}

function hashForPanelTab(tab: ListingScrollSectionTab): string {
  const recentlyClosed = listingRecentlyClosedPanelIdForTab(tab);
  if (recentlyClosed) return recentlyClosed;
  return listingSectionIdForTab(tab) ?? LISTING_SECTION_IDS.overview;
}

type ListingHeroPanelsProps = {
  header: ComponentProps<typeof ListingHeader>;
  location: {
    latitude: number | null;
    longitude: number | null;
    addressQuery: string;
    hidePin?: boolean;
    /** Spotlight privacy: outline this town with a ? instead of a property pin. */
    outlineTown?: string | null;
    defaultZoom?: number;
  };
  subnav: {
    mlsId: string;
    active: ListingTab;
    addressHint?: string | null;
    townHint?: string | null;
    interest?: ListingInterestProps | null;
    routeBase?: "listing" | "spotlight";
  };
  variant?: "default" | "spotlight";
  /** Spotlight property tabs (1 / 2 / 3) rendered above the Property Details label. */
  propertyTabs?: ReactNode;
  /** Suppress the MLS status badge (e.g. the Coming Soon spotlight tab). */
  hideStatusBadge?: boolean;
  /**
   * Overview photo-deck content (remarks on mobile + photo stack). Shown inside
   * the slide-up panel when Overview is selected — not in the page scroll flow.
   */
  belowTabs?: ReactNode;
  /**
   * Listing remarks for the desktop right column (above Location) while Overview
   * is active. Hidden when another analysis tab is open.
   */
  remarks?: string | null;
  /**
   * Section bodies (History / What if / Sold / …) for the slide-up panel.
   * When provided on overview, enables panel mode instead of page scroll.
   */
  sections?: ReactNode;
  /** Full-width content below the hero grid (e.g. comparables columns). */
  belowHero?: ReactNode;
  sidebar?: ReactNode;
  footer?: ReactNode;
  interest?: ListingInterestProps | null;
};

export default function ListingHeroPanels({
  header,
  location,
  subnav,
  variant = "default",
  propertyTabs = null,
  hideStatusBadge = false,
  belowTabs,
  remarks = null,
  sections = null,
  belowHero,
  sidebar,
  footer,
  interest = null,
}: ListingHeroPanelsProps) {
  const isSpotlight = variant === "spotlight";
  const frameClass = listingPanelCompactClass;
  const compactHero = Boolean(
    belowTabs || sections || belowHero || sidebar || footer || interest,
  );
  const isOverview = subnav.active === "overview";
  const useSlidePanel = isOverview && sections != null;
  const stickyChromeRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const panelScrollRef = useRef<HTMLDivElement>(null);
  const [mobileDrawer, setMobileDrawer] = useState<MobileDrawerId>(null);
  const [panelTab, setPanelTab] = useState<ListingScrollSectionTab | null>(
    null,
  );
  /** Location panel / map drawer — off by default; Map tab toggles it. */
  const [mapVisible, setMapVisible] = useState(false);
  /** Drawer is mobile-only; keep Location open when resizing up to desktop. */
  const [isDesktopLayout, setIsDesktopLayout] = useState(false);
  const {
    expanded: remarksExpanded,
    expand: expandRemarks,
    collapse: collapseRemarks,
  } = useListingRemarksExpand();
  const closeMobileDrawer = useCallback(() => setMobileDrawer(null), []);
  const toggleMap = useCallback(() => {
    setMapVisible((prev) => {
      const next = !prev;
      if (next) setMobileDrawer(null);
      const url = new URL(window.location.href);
      if (next) {
        window.history.replaceState(
          null,
          "",
          `${url.pathname}${url.search}#listing-location`,
        );
      } else if (url.hash === "#listing-location") {
        window.history.replaceState(null, "", `${url.pathname}${url.search}`);
      }
      return next;
    });
  }, []);
  const closeMap = useCallback(() => {
    setMapVisible(false);
    const url = new URL(window.location.href);
    if (url.hash === "#listing-location") {
      window.history.replaceState(null, "", `${url.pathname}${url.search}`);
    }
  }, []);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const sync = () => setIsDesktopLayout(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  const openPanel = useCallback((tab: ListingScrollSectionTab) => {
    setPanelTab(tab);
    const hash = hashForPanelTab(tab);
    const url = new URL(window.location.href);
    window.history.replaceState(
      null,
      "",
      `${url.pathname}${url.search}#${hash}`,
    );
    // Scroll panel content to top when switching tabs.
    requestAnimationFrame(() => {
      panelScrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });
    });
  }, []);

  const closePanel = useCallback(() => {
    setPanelTab(null);
    const url = new URL(window.location.href);
    window.history.replaceState(null, "", `${url.pathname}${url.search}`);
  }, []);

  // Deep-link: open panel from hash on overview mount / hash changes.
  useEffect(() => {
    if (!useSlidePanel) {
      setPanelTab(null);
      return;
    }
    const applyHash = () => {
      const hash = window.location.hash.replace(/^#/, "");
      if (hash === "listing-location") {
        setMapVisible(true);
        return;
      }
      const tab = tabFromLocationHash();
      if (tab) setPanelTab(tab);
    };
    applyHash();
    window.addEventListener("hashchange", applyHash);
    return () => window.removeEventListener("hashchange", applyHash);
  }, [useSlidePanel, subnav.mlsId]);

  // Non-panel pages: still honor #listing-location for the Map tab.
  useEffect(() => {
    if (useSlidePanel) return;
    const applyHash = () => {
      if (window.location.hash.replace(/^#/, "") === "listing-location") {
        setMapVisible(true);
      }
    };
    applyHash();
    window.addEventListener("hashchange", applyHash);
    return () => window.removeEventListener("hashchange", applyHash);
  }, [useSlidePanel, subnav.mlsId]);

  // Publish sticky chrome height so scroll-to-section targets clear the pinned tabs.
  useEffect(() => {
    const publish = () => {
      const height = stickyChromeRef.current?.offsetHeight ?? 0;
      document.documentElement.style.setProperty(
        "--listing-sticky-offset",
        `${height + 12}px`,
      );
    };
    publish();
    const el = stickyChromeRef.current;
    if (!el) return;
    const ro = new ResizeObserver(publish);
    ro.observe(el);
    return () => {
      ro.disconnect();
      document.documentElement.style.removeProperty("--listing-sticky-offset");
    };
  }, [subnav.active, belowTabs, sections, propertyTabs, isOverview, header.insight, panelTab]);

  const statusLabel = formatMlsStatus(header.status);
  const overviewInsight =
    isOverview && header.insight?.trim() ? header.insight.trim() : null;

  const statusBadge =
    statusLabel && !hideStatusBadge ? (
      <span className="shrink-0">
        <DealBoardStatusBadge status={statusLabel} size="sm" surface="listing" />
      </span>
    ) : null;

  const insightPanel = overviewInsight ? (
    <aside
      className="ml-auto flex w-fit max-w-full min-w-0 flex-col overflow-visible"
      aria-label="Listing insight"
    >
      <p className="mb-1 text-center font-mono text-[10px] tracking-[0.2em] uppercase text-gold">
        Insight
      </p>
      <ListingInsightCopy
        text={overviewInsight}
        className="text-left text-[10px] sm:text-[11px] leading-snug text-white/70 break-words"
        medianHref={`#${LISTING_ANALYSIS_ID}`}
      />
    </aside>
  ) : null;

  /** Status + insight docked to the right of Property Details; label centered over copy. */
  const statusInsightColumn =
    statusBadge || insightPanel ? (
      <div className="ml-auto flex w-full shrink-0 flex-col items-end gap-2 sm:w-[min(20rem,46%)]">
        {statusBadge ? (
          <div className="flex w-full justify-end">{statusBadge}</div>
        ) : null}
        {insightPanel}
      </div>
    ) : null;

  const topLeft = propertyTabs ? (
    <div className="min-w-0">{propertyTabs}</div>
  ) : !isSpotlight ? (
    <ListingBackLink className="" />
  ) : null;

  const headerShared = {
    ...header,
    privacyMode: header.privacyMode ?? false,
    hideMarketMeta: header.hideMarketMeta ?? isSpotlight,
    // Insight renders in the Property Details right panel, not above the photos.
    insight: null,
    className: "mb-0" as const,
    compact: true as const,
  };

  const heroOnly = (
    <ListingHeader {...headerShared} parts="heroInsight" tabsSlot={null} />
  );

  const tabsNav = (
    <Suspense fallback={null}>
      <ListingSubnav
        {...subnav}
        embedded
        compact
        panelTab={useSlidePanel ? panelTab : null}
        onPanelOpen={useSlidePanel ? openPanel : null}
        onPanelClose={useSlidePanel ? closePanel : null}
        forceShowPhotos={useSlidePanel && panelTab != null}
        mapVisible={mapVisible}
        onMapToggle={toggleMap}
      />
    </Suspense>
  );

  const stickySurfaceClass =
    "bg-[#1B2A4A]/95 backdrop-blur-md";

  const panelOpen = useSlidePanel && panelTab != null;

  const panelSections =
    useSlidePanel && isValidElement(sections)
      ? cloneElement(
          sections as ReactElement<{
            mode?: "stack" | "panel";
            activeTab?: ListingScrollSectionTab | null;
          }>,
          {
            mode: "panel",
            activeTab:
              panelTab && panelTab !== "overview" ? panelTab : null,
          },
        )
      : sections;

  const slidePanel = useSlidePanel ? (
    <div
      ref={panelScrollRef}
      id={LISTING_SECTION_IDS.overview}
      className={`listing-tab-panel absolute inset-x-0 top-0 z-20 flex flex-col border-0 bg-[#1B2A4A] pt-2 pb-4 shadow-[0_-12px_40px_-16px_rgba(0,0,0,0.55)] transition-transform duration-300 ease-out ${
        panelOpen
          ? "max-h-[min(70vh,calc(100dvh-var(--listing-sticky-offset,6rem)-1rem))] min-h-full translate-y-0 overflow-y-auto overscroll-contain"
          : "pointer-events-none invisible h-0 min-h-0 max-h-0 translate-y-full overflow-hidden p-0 shadow-none"
      }`}
      aria-hidden={!panelOpen}
    >
      {panelOpen ? (
        <>
          <div
            className={`min-w-0 ${panelTab === "overview" ? "block" : "hidden"}`}
          >
            {belowTabs}
          </div>
          <div
            className={`min-w-0 px-4 ${
              panelTab && panelTab !== "overview" ? "block" : "hidden"
            }`}
          >
            {panelSections}
          </div>
        </>
      ) : null}
    </div>
  ) : null;

  const heroStage = useSlidePanel ? (
    <div
      ref={stageRef}
      className={`relative mt-0 overflow-x-hidden ${
        panelOpen ? "overflow-y-hidden" : "overflow-visible"
      }`}
    >
      {heroOnly}
      {slidePanel}
    </div>
  ) : (
    heroOnly
  );

  // No card shell — rounded/frosted frames read as medium-blue borders on the
  // navy page and around slide-up tab content.
  const remarksTeaserLine = firstListingRemarksLine(remarks);
  const remarksSurfaceActive =
    isOverview &&
    (!useSlidePanel || panelTab === null || panelTab === "overview");
  const showRemarksTeaser =
    remarksSurfaceActive && Boolean(remarksTeaserLine);

  useEffect(() => {
    if (!remarksSurfaceActive) collapseRemarks();
  }, [remarksSurfaceActive, collapseRemarks]);

  const propertyPanel = (
    <div className="min-w-0">
      {/* Meta + section tabs stay pinned under the site nav while photos/content scroll. */}
      <div
        ref={stickyChromeRef}
        className={`sticky ${STICKY_TOP_CLASS} z-30 overflow-visible pt-1 pb-3 ${stickySurfaceClass} shadow-[0_8px_24px_-12px_rgba(0,0,0,0.65)]`}
      >
        {topLeft ? (
          <div className={propertyTabs ? undefined : "mb-1.5"}>{topLeft}</div>
        ) : null}

        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
          <div className="min-w-0 flex-1">
            <p className="mb-1.5 font-mono text-[10px] tracking-[0.2em] uppercase text-gold">
              Property Details
            </p>
            <ListingHeader {...headerShared} parts="meta" tabsSlot={null} />
          </div>
          {statusInsightColumn}
        </div>

        <div className="mt-2">{tabsNav}</div>
      </div>

      {showRemarksTeaser ? (
        <button
          type="button"
          onClick={expandRemarks}
          className="mt-2 mb-2 w-full min-w-0 text-left text-[11px] leading-snug text-white/70 transition-colors hover:text-gold focus:outline-none focus-visible:text-gold"
          aria-expanded={remarksExpanded}
          title="Expand listing remarks"
        >
          <span className="line-clamp-1">
            {remarksTeaserLine}
            …
          </span>
        </button>
      ) : null}

      <ListingPhotosModeContext.Provider
        value={useSlidePanel ? closePanel : null}
      >
        {heroStage}
      </ListingPhotosModeContext.Provider>
    </div>
  );

  const mapBlock = (frameClassName: string, showLabel: boolean) => (
    <div id="listing-location" className={`${frameClass} flex flex-col`}>
      {showLabel ? (
        <p className="mb-2 shrink-0 font-mono text-[10px] tracking-[0.2em] uppercase text-gold">
          Location
        </p>
      ) : null}
      <div className={`relative w-full ${frameClassName}`}>
        <ListingLocationMap
          latitude={location.latitude}
          longitude={location.longitude}
          addressQuery={location.addressQuery}
          variant="hero"
          className="absolute inset-0"
          hideLabel
          hidePin={location.hidePin}
          outlineTown={location.outlineTown}
          defaultZoom={location.defaultZoom}
        />
      </div>
    </div>
  );

  const interestButton = interest ? (
    <ListingInterestButton
      mlsId={interest.mlsId}
      address={interest.address}
      city={interest.city}
    />
  ) : null;

  const detailsBlock = (
    <div className="flex min-w-0 flex-col gap-4">
      {interestButton}
      {sidebar ? <div className="shrink-0">{sidebar}</div> : null}
    </div>
  );

  // Desktop remarks above Location — only while Overview (not Sold / History / …).
  const remarksPanel = remarksSurfaceActive ? (
    <ListingRemarksSidePanel
      remarks={remarks}
      frameClass={frameClass}
      expanded={remarksExpanded}
      onExpand={expandRemarks}
      onCollapse={collapseRemarks}
    />
  ) : null;

  const rightColumn = (
    <div
      className={`hidden min-w-0 flex-col gap-4 lg:sticky lg:flex ${STICKY_TOP_CLASS} z-20`}
    >
      {interestButton}
      {/* Criteria panel portals here when open — always above Location. */}
      <div
        id={LISTING_CRITERIA_SLOT_ID}
        className="min-w-0 w-full text-left empty:hidden"
      />
      {remarksPanel}
      {mapVisible ? mapBlock("aspect-square", true) : null}
      {sidebar ? <div className="shrink-0">{sidebar}</div> : null}
    </div>
  );

  // Legacy: non-overview pages still put content in belowTabs page flow.
  // Overview + sections uses the slide-up panel only (no long page scroll).
  const belowTabsBlock =
    !useSlidePanel && belowTabs ? (
      <div
        id={
          subnav.active === "overview" ? LISTING_SECTION_IDS.overview : undefined
        }
        className="mt-3 scroll-mt-[var(--listing-sticky-offset,6rem)] border-t border-white/10 pt-3"
      >
        {belowTabs}
      </div>
    ) : null;

  const edgeTabClass = (active: boolean) =>
    `flex items-center justify-center rounded-l-lg border border-r-0 px-1.5 py-3 shadow-[-4px_0_16px_-8px_rgba(0,0,0,0.55)] transition-colors ${
      active
        ? "border-gold/50 bg-gold text-navy"
        : "border-white/15 bg-[#1B2A4A]/95 text-gold backdrop-blur-md hover:border-gold/40 hover:text-gold-light"
    }`;

  return (
    <ListingCriteriaVisibilityProvider>
      <div
        className={`grid grid-cols-1 items-start gap-x-7 gap-y-4 lg:grid-cols-[minmax(0,1fr)_min(22rem,32vw)] lg:gap-x-10 ${
          compactHero ? "" : "mb-6"
        }`}
      >
        <div className="order-1 min-w-0 lg:col-start-1 lg:row-start-1">
          {propertyPanel}
        </div>

        {/*
          Stretch this cell to the full grid-row height (driven by the left
          column) so `position: sticky` on the right stack has room to pin —
          same idea as Property Details chrome sitting in a tall left frame.
        */}
        <div className="order-2 min-w-0 lg:col-start-2 lg:row-start-1 lg:self-stretch">
          {rightColumn}
        </div>

        {belowTabsBlock ? (
          <div className="order-3 min-w-0 lg:col-start-1 lg:row-start-2">
            {belowTabsBlock}
            {footer ? <div className="mt-4">{footer}</div> : null}
          </div>
        ) : footer ? (
          <div className="order-3 min-w-0 lg:col-start-1 lg:row-start-2">
            <div className="mt-4">{footer}</div>
          </div>
        ) : null}
      </div>
      {belowHero ? (
        <div className="mt-6 border-t border-white/10 pt-6 lg:mt-8 lg:pt-8">
          {belowHero}
        </div>
      ) : null}

      {/* Mobile: Map + Details peek from the right edge and open as slide-overs. */}
      <div
        className="fixed right-0 top-[42%] z-[60] flex -translate-y-1/2 flex-col gap-2 lg:hidden"
        role="group"
        aria-label="Listing side panels"
      >
        <button
          type="button"
          className={edgeTabClass(mapVisible)}
          aria-expanded={mapVisible}
          aria-controls="listing-map-drawer"
          onClick={() => {
            setMobileDrawer(null);
            setMapVisible((prev) => !prev);
          }}
        >
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] [writing-mode:vertical-rl] rotate-180">
            Map
          </span>
        </button>
        {sidebar || interest ? (
          <button
            type="button"
            className={edgeTabClass(mobileDrawer === "details")}
            aria-expanded={mobileDrawer === "details"}
            aria-controls="listing-details-drawer"
            onClick={() => {
              setMapVisible(false);
              setMobileDrawer((prev) =>
                prev === "details" ? null : "details",
              );
            }}
          >
            <span className="font-mono text-[10px] uppercase tracking-[0.18em] [writing-mode:vertical-rl] rotate-180">
              Details
            </span>
          </button>
        ) : null}
      </div>

      <ListingSideDrawer
        open={mapVisible && !isDesktopLayout}
        onClose={() => {
          // SideDrawer calls onClose when crossing to lg — keep Location open
          // so the desktop panel stays visible after a mobile Map open.
          if (window.matchMedia("(min-width: 1024px)").matches) return;
          closeMap();
        }}
        title="Map"
      >
        <div id="listing-map-drawer">
          {mapBlock("aspect-square max-h-[min(70vh,28rem)]", false)}
        </div>
      </ListingSideDrawer>

      <ListingSideDrawer
        open={mobileDrawer === "details"}
        onClose={closeMobileDrawer}
        title="Details"
      >
        <div id="listing-details-drawer">{detailsBlock}</div>
      </ListingSideDrawer>
    </ListingCriteriaVisibilityProvider>
  );
}
