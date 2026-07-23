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
  ListingRemarksContent,
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

type MobileDrawerId = "more" | "remarks" | "insight" | "details" | null;

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
  // Land on the section label (SOLD / RENTED / …), not the inner
  // Recently sold/rented panel (which sits below the Green = exact match legend).
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
  /**
   * Photos tab stays hidden until the user clicks a photo on Overview
   * (enters photos mode). Resets when the listing changes.
   */
  const [photosTabVisible, setPhotosTabVisible] = useState(false);
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
  const openAnalysisInDetails = useCallback(() => {
    setMapVisible(false);
    setMobileDrawer("details");
    const loc = new URL(window.location.href);
    if (loc.hash.replace(/^#/, "") !== LISTING_ANALYSIS_ID) {
      window.history.replaceState(
        null,
        "",
        `${loc.pathname}${loc.search}#${LISTING_ANALYSIS_ID}`,
      );
    }
  }, []);
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

  // Median PPSF → Details drawer: scroll Analysis into view and highlight it.
  useEffect(() => {
    if (mobileDrawer !== "details" || isDesktopLayout) return;
    if (window.location.hash.replace(/^#/, "") !== LISTING_ANALYSIS_ID) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      if (cancelled) return;
      const el = document.querySelector(
        `#listing-details-drawer #${LISTING_ANALYSIS_ID}`,
      );
      if (el instanceof HTMLElement) {
        el.scrollIntoView({ block: "start", behavior: "smooth" });
      }
    }, 80);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [mobileDrawer, isDesktopLayout]);

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

  /** Clicking an Overview photo: reveal Photos tab + collapse any slide panel. */
  const enterPhotosMode = useCallback(() => {
    setPhotosTabVisible(true);
    setPanelTab(null);
    const url = new URL(window.location.href);
    window.history.replaceState(null, "", `${url.pathname}${url.search}`);
  }, []);

  useEffect(() => {
    setPhotosTabVisible(false);
  }, [subnav.mlsId]);

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

  const overviewInsight =
    isOverview && header.insight?.trim() ? header.insight.trim() : null;

  const statusLabel = formatMlsStatus(header.status);

  const statusBadge =
    statusLabel && !hideStatusBadge ? (
      <span className="shrink-0">
        <DealBoardStatusBadge status={statusLabel} size="sm" surface="listing" />
      </span>
    ) : null;

  const insightBody = overviewInsight ? (
    <ListingInsightCopy
      text={overviewInsight}
      className="text-left text-[10px] sm:text-[11px] leading-snug text-white/70 break-words"
      medianHref={`#${LISTING_ANALYSIS_ID}`}
    />
  ) : null;

  /** Desktop only — mobile uses the Insight bottom pop-out tab. */
  const insightPanel = insightBody ? (
    <aside
      className="ml-auto hidden w-fit max-w-full min-w-0 flex-col overflow-visible lg:flex"
      aria-label="Listing insight"
    >
      <p className="mb-1 text-center font-mono text-[10px] tracking-[0.2em] uppercase text-gold">
        Insight
      </p>
      {insightBody}
    </aside>
  ) : null;

  /** Desktop insight only — status sits on the Spotlight / Back row above. */
  const insightColumn = insightPanel ? (
    <div className="ml-auto hidden w-full shrink-0 flex-col items-end sm:w-[min(20rem,46%)] lg:flex">
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
        forceShowPhotos={photosTabVisible}
        mapVisible={mapVisible}
        onMapToggle={toggleMap}
      />
    </Suspense>
  );

  const stickySurfaceClass =
    "bg-[#1B2A4A]/95 backdrop-blur-md";

  const panelOpen = useSlidePanel && panelTab != null;

  // Android: lock document scroll while the slide-up tab panel is open so
  // touch pans hit the panel scrollport instead of the page behind it.
  useEffect(() => {
    if (!panelOpen || isDesktopLayout) return;
    const html = document.documentElement;
    const body = document.body;
    const prevHtml = html.style.overflow;
    const prevBody = body.style.overflow;
    html.style.overflow = "hidden";
    body.style.overflow = "hidden";
    return () => {
      html.style.overflow = prevHtml;
      body.style.overflow = prevBody;
    };
  }, [panelOpen, isDesktopLayout]);

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

  // Mobile: fixed scrollport under sticky chrome (Android Chrome often won't
  // scroll an absolute panel that also has transform). Desktop: absolute over hero.
  const slidePanel = useSlidePanel ? (
    <div
      className={
        panelOpen
          ? "z-20 flex flex-col border-0 bg-[#1B2A4A] shadow-[0_-12px_40px_-16px_rgba(0,0,0,0.55)] max-lg:fixed max-lg:inset-x-0 max-lg:top-[var(--listing-sticky-offset,6rem)] max-lg:bottom-0 lg:absolute lg:inset-x-0 lg:top-0 lg:h-[min(68vh,calc(100dvh-var(--listing-sticky-offset,6rem)-1rem))]"
          : "pointer-events-none invisible absolute inset-x-0 top-0 z-20 h-0 max-h-0 translate-y-full overflow-hidden"
      }
      aria-hidden={!panelOpen}
    >
      {panelOpen ? (
        <div
          ref={panelScrollRef}
          id={LISTING_SECTION_IDS.overview}
          className="listing-tab-panel min-h-0 flex-1 overflow-y-scroll overscroll-y-contain touch-pan-y pt-2 pb-4 max-lg:px-0 lg:pb-4"
        >
          <div
            className={`min-w-0 ${panelTab === "overview" ? "block" : "hidden"}`}
          >
            {belowTabs}
          </div>
          <div
            className={`min-w-0 max-lg:px-0 lg:px-4 ${
              panelTab && panelTab !== "overview" ? "block" : "hidden"
            }`}
          >
            {panelSections}
          </div>
        </div>
      ) : null}
    </div>
  ) : null;

  const heroStage = useSlidePanel ? (
    <div
      ref={stageRef}
      className="relative mt-0 overflow-x-hidden overflow-y-visible"
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
    <div className="min-w-0 max-lg:w-full">
      {/* Meta + section tabs stay pinned under the site nav while photos/content scroll. */}
      <div
        ref={stickyChromeRef}
        className={`sticky ${STICKY_TOP_CLASS} z-30 overflow-visible pt-1 max-lg:px-3 ${stickySurfaceClass} shadow-[0_8px_24px_-12px_rgba(0,0,0,0.65)] ${
          subnav.active === "photos" && !heroSlot ? "pb-0" : "pb-3"
        }`}
      >
        {/* Status top-aligned with Spotlight Properties / ← Back to …;
            mobile MORE sits under the status pill. */}
        <div className="mb-1.5 flex items-start justify-between gap-3">
          <div className="min-w-0">{topLeft}</div>
          <div className="flex shrink-0 flex-col items-end gap-1 self-start">
            {statusBadge}
            <button
              type="button"
              className="lg:hidden font-mono text-[9px] uppercase tracking-[0.14em] text-white/70 underline decoration-white/35 underline-offset-2 transition-colors hover:text-gold hover:decoration-gold/50"
              aria-expanded={mobileDrawer === "more"}
              aria-controls="listing-more-drawer"
              onClick={() => {
                setMapVisible(false);
                setMobileDrawer((prev) => (prev === "more" ? null : "more"));
              }}
            >
              More
            </button>
          </div>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
          <div className="min-w-0 flex-1">
            <p className="mb-1.5 font-mono text-[10px] tracking-[0.2em] uppercase text-gold">
              Property Details
            </p>
            <ListingHeader {...headerShared} parts="meta" tabsSlot={null} />
          </div>
          {insightColumn}
        </div>

        <div className="mt-2">{tabsNav}</div>

        {/*
          Keep the Overview remarks teaser inside sticky chrome so it stays
          above the hero (and above the mobile slide-up panel, which is fixed
          from --listing-sticky-offset downward and would otherwise cover it).
        */}
        {showRemarksTeaser ? (
          <button
            type="button"
            onClick={() => {
              if (isDesktopLayout) {
                expandRemarks();
                return;
              }
              setMapVisible(false);
              setMobileDrawer((prev) =>
                prev === "remarks" ? null : "remarks",
              );
            }}
            className="mt-2 w-full min-w-0 text-left text-[11px] leading-snug text-white/70 underline decoration-white/45 underline-offset-2 transition-colors hover:text-gold hover:decoration-gold/50 focus:outline-none focus-visible:text-gold"
            aria-expanded={
              isDesktopLayout
                ? remarksExpanded
                : mobileDrawer === "remarks"
            }
            title={
              isDesktopLayout
                ? "Expand listing remarks"
                : "Open listing remarks"
            }
          >
            <span className="line-clamp-1">
              {remarksTeaserLine}
              …
            </span>
          </button>
        ) : null}
      </div>

      <ListingPhotosModeContext.Provider
        value={useSlidePanel ? enterPhotosMode : null}
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
      {/* Mount Details only on desktop so Analysis id isn't duplicated vs the mobile drawer. */}
      {isDesktopLayout && sidebar ? (
        <div className="shrink-0">{sidebar}</div>
      ) : null}
    </div>
  );

  // Legacy: non-overview pages still put content in belowTabs page flow.
  // Overview + sections uses the slide-up panel only (no long page scroll).
  // Photos: sit flush under the tab strip (Intelligence deep-links here).
  const belowTabsBlock =
    !useSlidePanel && belowTabs ? (
      <div
        id={
          subnav.active === "overview" ? LISTING_SECTION_IDS.overview : undefined
        }
        className={
          subnav.active === "photos"
            ? "min-w-0 scroll-mt-[var(--listing-sticky-offset,6rem)]"
            : "mt-3 scroll-mt-[var(--listing-sticky-offset,6rem)] border-t border-white/10 pt-3"
        }
      >
        {belowTabs}
      </div>
    ) : null;

  const moreMenuLinkClass =
    "w-full text-left font-mono text-[11px] uppercase tracking-[0.16em] text-gold/90 underline decoration-gold/35 underline-offset-2 transition-colors hover:text-gold py-2";

  const openMobileDrawer = (id: Exclude<MobileDrawerId, null>) => {
    setMapVisible(false);
    setMobileDrawer(id);
  };

  const openMobileMap = () => {
    setMobileDrawer(null);
    setMapVisible(true);
    const url = new URL(window.location.href);
    window.history.replaceState(
      null,
      "",
      `${url.pathname}${url.search}#listing-location`,
    );
  };

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
        <div className="mt-6 border-t border-white/10 pt-6 max-lg:px-0 lg:mt-8 lg:pt-8">
          {belowHero}
        </div>
      ) : null}

      {/* Mobile: MORE menu → Insight / Details / Map; remarks via teaser only. */}
      <ListingSideDrawer
        open={mobileDrawer === "more" && !isDesktopLayout}
        onClose={closeMobileDrawer}
        title="More"
      >
        <nav
          id="listing-more-drawer"
          className="flex flex-col divide-y divide-white/10"
          aria-label="More listing panels"
        >
          {overviewInsight ? (
            <button
              type="button"
              className={moreMenuLinkClass}
              onClick={() => openMobileDrawer("insight")}
            >
              Insight
            </button>
          ) : null}
          {sidebar || interest ? (
            <button
              type="button"
              className={moreMenuLinkClass}
              onClick={() => openMobileDrawer("details")}
            >
              Details
            </button>
          ) : null}
          <button
            type="button"
            className={moreMenuLinkClass}
            onClick={openMobileMap}
          >
            Map
          </button>
        </nav>
      </ListingSideDrawer>

      <ListingSideDrawer
        open={mobileDrawer === "remarks" && !isDesktopLayout}
        onClose={closeMobileDrawer}
        title="Listing remarks"
      >
        <div id="listing-remarks-drawer">
          <ListingRemarksContent remarks={remarks} compact />
        </div>
      </ListingSideDrawer>

      <ListingSideDrawer
        open={mobileDrawer === "insight" && !isDesktopLayout}
        onClose={closeMobileDrawer}
        title="Insight"
      >
        <div id="listing-insight-drawer">
          {overviewInsight ? (
            <ListingInsightCopy
              text={overviewInsight}
              className="text-left text-sm leading-relaxed text-white/80 break-words"
              medianHref={`#${LISTING_ANALYSIS_ID}`}
              onMedianClick={openAnalysisInDetails}
            />
          ) : null}
        </div>
      </ListingSideDrawer>

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
        open={mobileDrawer === "details" && !isDesktopLayout}
        onClose={closeMobileDrawer}
        title="Details"
      >
        <div id="listing-details-drawer">{detailsBlock}</div>
      </ListingSideDrawer>
    </ListingCriteriaVisibilityProvider>
  );
}
