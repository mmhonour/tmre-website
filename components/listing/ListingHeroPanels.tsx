"use client";

import {
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
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
import ListingShareButton from "@/components/listing/ListingShareButton";
import ListingPropertyFacts from "@/components/listing/ListingPropertyFacts";
import { listingPanelCompactClass } from "@/components/listing/listing-frame";
import ListingInterestButton from "@/components/listing/ListingInterestButton";
import { LISTING_CRITERIA_SLOT_ID } from "@/components/listing/ListingCriteriaSideLayout";
import { ListingCriteriaVisibilityProvider } from "@/components/listing/ListingCriteriaVisibilityContext";
import {
  ListingPhotosModeContext,
  type ListingPhotosModeApi,
} from "@/components/listing/ListingPhotosModeContext";
import {
  ListingDesktopDeckProvider,
  type ListingDesktopDeckCardId,
} from "@/components/listing/ListingDesktopDeckContext";
import ListingHistorySidePanel from "@/components/listing/ListingHistorySidePanel";
import ListingHistoryPanel from "@/components/ListingHistoryPanel";
import {
  firstListingRemarksLine,
  ListingRemarksContent,
} from "@/components/listing/ListingOverviewPanels";
import ListingRemarksSidePanel, {
  useListingRemarksExpand,
} from "@/components/listing/ListingRemarksSidePanel";
import { ListingBackLink } from "@/components/listing/ListingShell";
import { LISTING_ANALYSIS_ID } from "@/components/listing/ListingDetailsSchoolsPanel";
import ListingAdminAgentPanel from "@/components/listing/ListingAdminAgentPanel";
import { useSiteUnlocked } from "@/components/SiteUnlockProvider";
import { formatMlsStatus } from "@/lib/listing-history";
import { isRentalListing } from "@/lib/listing-kind";
import {
  extractListingAgentContact,
  type ListingAgentContact,
} from "@/lib/listing-agent-contact";
import { listingSectionHref, listingShareHref } from "@/lib/listing-url";
import { SPOTLIGHT_SHARE_URL, spotlightSectionHref } from "@/lib/spotlight-url";
import { useRouter } from "next/navigation";
import {
  cloneElement,
  isValidElement,
  type ComponentProps,
  type ReactElement,
  type ReactNode,
} from "react";

type MobileDrawerId = "remarks" | "insight" | "details" | null;

type MobileEdgePillId = "insight" | "details" | "if" | "map";

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
   * Listing remarks for the desktop right column (above Details) while Overview
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
  /** Opaque RETS row — Admin tab shows contacting / list agent when unlocked. */
  listingRaw?: Record<string, string> | null;
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
  listingRaw = null,
}: ListingHeroPanelsProps) {
  const router = useRouter();
  const siteUnlocked = useSiteUnlocked();
  const isSpotlight = variant === "spotlight";
  const adminAgentContact: ListingAgentContact | null = useMemo(
    () => extractListingAgentContact(listingRaw),
    [listingRaw],
  );
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
   * Overview surface (not Sold / History / … panel). Mobile moves property
   * facts into a bottom dock so sticky tabs + remarks can sit higher.
   */
  const remarksSurfaceActive =
    isOverview &&
    (!useSlidePanel || panelTab === null || panelTab === "overview");
  /**
   * Photos tab stays hidden until the user clicks a photo on Overview
   * (enters photos mode). Resets when the listing changes.
   */
  const [photosTabVisible, setPhotosTabVisible] = useState(false);
  /** Hero index while Photos tab / photos mode is active. */
  const [photosModeIndex, setPhotosModeIndex] = useState(0);
  const photosModeCountRef = useRef(0);
  /** Location panel / map drawer — off by default; Map tab toggles it. */
  const [mapVisible, setMapVisible] = useState(false);
  /** Admin contacting-agent panel — site unlock only. */
  const [adminVisible, setAdminVisible] = useState(false);
  /** Drawer is mobile-only; keep Location open when resizing up to desktop. */
  const [isDesktopLayout, setIsDesktopLayout] = useState(false);
  const {
    expanded: remarksExpanded,
    expand: expandRemarks,
    collapse: collapseRemarks,
  } = useListingRemarksExpand();
  /**
   * Desktop Overview card deck: which of Remarks / Details / History / Admin
   * is expanded. Null = all header-only (peeking deck tops).
   */
  const [activeDeckCard, setActiveDeckCard] =
    useState<ListingDesktopDeckCardId | null>("remarks");
  const closeMobileDrawer = useCallback(() => setMobileDrawer(null), []);

  const openMobileDrawer = useCallback((id: Exclude<MobileDrawerId, null>) => {
    setMapVisible(false);
    setPanelTab(null);
    setMobileDrawer(id);
  }, []);

  const openMobileMap = useCallback(() => {
    setMobileDrawer(null);
    setPanelTab(null);
    setMapVisible(true);
    const url = new URL(window.location.href);
    window.history.replaceState(
      null,
      "",
      `${url.pathname}${url.search}#listing-location`,
    );
  }, []);

  /** History / What if — slide-up on Overview; route navigate elsewhere. */
  const openMobileSectionPill = useCallback(
    (tab: "history" | "if") => {
      setMapVisible(false);
      setMobileDrawer(null);
      if (useSlidePanel) {
        setPanelTab((prev) => {
          if (prev === tab) {
            const url = new URL(window.location.href);
            window.history.replaceState(null, "", `${url.pathname}${url.search}`);
            return null;
          }
          const hash = hashForPanelTab(tab);
          const url = new URL(window.location.href);
          const windowScrollY = window.scrollY;
          window.history.replaceState(
            null,
            "",
            `${url.pathname}${url.search}#${hash}`,
          );
          window.scrollTo(0, windowScrollY);
          return tab;
        });
        if (tab === "history") setActiveDeckCard(null);
        return;
      }
      const href =
        subnav.routeBase === "spotlight"
          ? spotlightSectionHref(tab)
          : listingSectionHref(
              subnav.mlsId,
              tab,
              subnav.addressHint,
              subnav.townHint,
            );
      router.push(href);
    },
    [
      useSlidePanel,
      subnav.routeBase,
      subnav.mlsId,
      subnav.addressHint,
      subnav.townHint,
      router,
    ],
  );

  /** Insight median $/sqft → open Details deck card + highlight Analysis. */
  const activateAnalysisFromMedian = useCallback(() => {
    collapseRemarks();
    setActiveDeckCard("details");
    setMapVisible(false);
    const loc = new URL(window.location.href);
    if (loc.hash.replace(/^#/, "") !== LISTING_ANALYSIS_ID) {
      window.history.replaceState(
        null,
        "",
        `${loc.pathname}${loc.search}#${LISTING_ANALYSIS_ID}`,
      );
    }
    if (isDesktopLayout) {
      setMobileDrawer((prev) =>
        prev === "remarks" || prev === "insight" ? null : prev,
      );
      // After remarks collapse, bring Analysis into view in the right column.
      window.requestAnimationFrame(() => {
        window.setTimeout(() => {
          document.getElementById(LISTING_ANALYSIS_ID)?.scrollIntoView({
            block: "nearest",
            behavior: "smooth",
          });
        }, 80);
      });
      return;
    }
    setMobileDrawer("details");
  }, [collapseRemarks, isDesktopLayout]);
  const toggleMap = useCallback(() => {
    setMapVisible((prev) => {
      const next = !prev;
      if (next) {
        setMobileDrawer(null);
        setAdminVisible(false);
      }
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

  const toggleAdmin = useCallback(() => {
    if (!siteUnlocked) return;
    setMapVisible(false);
    setMobileDrawer(null);
    if (isDesktopLayout) {
      // Desktop: Admin is always in the deck when unlocked — tab expands/minimizes it.
      setAdminVisible(true);
      setActiveDeckCard((prev) => (prev === "admin" ? null : "admin"));
      const url = new URL(window.location.href);
      if (activeDeckCard !== "admin") {
        window.history.replaceState(
          null,
          "",
          `${url.pathname}${url.search}#listing-admin`,
        );
      } else if (url.hash === "#listing-admin") {
        window.history.replaceState(null, "", `${url.pathname}${url.search}`);
      }
      return;
    }
    setAdminVisible((prev) => {
      const next = !prev;
      if (next) {
        const url = new URL(window.location.href);
        window.history.replaceState(
          null,
          "",
          `${url.pathname}${url.search}#listing-admin`,
        );
      } else {
        const url = new URL(window.location.href);
        if (url.hash === "#listing-admin") {
          window.history.replaceState(null, "", `${url.pathname}${url.search}`);
        }
      }
      return next;
    });
  }, [siteUnlocked, isDesktopLayout, activeDeckCard]);

  useEffect(() => {
    if (!siteUnlocked) {
      setAdminVisible(false);
      setActiveDeckCard((prev) => (prev === "admin" ? "remarks" : prev));
      return;
    }
    // Desktop: keep Admin in the peeking deck whenever site-unlocked.
    if (isDesktopLayout) setAdminVisible(true);
  }, [siteUnlocked, isDesktopLayout]);

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

  const elevateHistoryPanel = useCallback(() => {
    setActiveDeckCard("history");
    setPanelTab(null);
    const hash = hashForPanelTab("history");
    const url = new URL(window.location.href);
    const windowScrollY = window.scrollY;
    window.history.replaceState(
      null,
      "",
      `${url.pathname}${url.search}#${hash}`,
    );
    window.scrollTo(0, windowScrollY);
  }, []);

  const toggleHistoryPanel = useCallback(() => {
    setActiveDeckCard((prev) => {
      const next = prev === "history" ? null : "history";
      if (next === "history") {
        setPanelTab(null);
        const hash = hashForPanelTab("history");
        const url = new URL(window.location.href);
        const windowScrollY = window.scrollY;
        window.history.replaceState(
          null,
          "",
          `${url.pathname}${url.search}#${hash}`,
        );
        window.scrollTo(0, windowScrollY);
      } else {
        const url = new URL(window.location.href);
        window.history.replaceState(null, "", `${url.pathname}${url.search}`);
      }
      return next;
    });
  }, []);

  const openPanel = useCallback(
    (tab: ListingScrollSectionTab) => {
      // Desktop Overview: History is a deck card — expand it instead of slide-up.
      if (
        tab === "history" &&
        typeof window !== "undefined" &&
        window.matchMedia("(min-width: 1024px)").matches
      ) {
        elevateHistoryPanel();
        return;
      }
      if (tab !== "history") setActiveDeckCard("remarks");
      setPanelTab(tab);
      const hash = hashForPanelTab(tab);
      const url = new URL(window.location.href);
      // Preserve window scroll — assigning a hash that matches a newly shown
      // section id can make the browser scroll the page past the section label.
      const windowScrollY = window.scrollY;
      window.history.replaceState(
        null,
        "",
        `${url.pathname}${url.search}#${hash}`,
      );
      window.scrollTo(0, windowScrollY);
    },
    [elevateHistoryPanel],
  );

  const closePanel = useCallback(() => {
    setPanelTab(null);
    const url = new URL(window.location.href);
    window.history.replaceState(null, "", `${url.pathname}${url.search}`);
  }, []);

  /** Clicking an Overview photo / Photos tab: reveal Photos + collapse panel. */
  const enterPhotosMode = useCallback((photoIndex?: number) => {
    setPhotosTabVisible(true);
    setPanelTab(null);
    if (typeof photoIndex === "number" && Number.isFinite(photoIndex)) {
      const count = photosModeCountRef.current;
      const max = count > 0 ? count - 1 : 0;
      setPhotosModeIndex(Math.min(Math.max(Math.trunc(photoIndex), 0), max));
    }
    const url = new URL(window.location.href);
    window.history.replaceState(null, "", `${url.pathname}${url.search}`);
  }, []);

  const cyclePhotosMode = useCallback((delta: number) => {
    const n = photosModeCountRef.current;
    if (n <= 1) return;
    setPhotosModeIndex((i) => (i + delta + n * 10) % n);
  }, []);

  const registerPhotosModeCount = useCallback((count: number) => {
    photosModeCountRef.current = Math.max(0, count);
    if (count > 0) {
      setPhotosModeIndex((i) => Math.min(i, count - 1));
    }
  }, []);

  const photosModeActive = useSlidePanel && photosTabVisible && panelTab == null;
  /**
   * Mobile facts dock: Overview content only — not Photos mode, not Sold /
   * Comps / What if / etc. Under-address facts stay hidden on mobile always.
   */
  const showMobileMetaDock = remarksSurfaceActive && !photosModeActive;

  const photosModeApi = useMemo<ListingPhotosModeApi | null>(() => {
    if (!useSlidePanel) return null;
    return {
      enter: enterPhotosMode,
      active: photosModeActive,
      photoIndex: photosModeIndex,
      setPhotoIndex: setPhotosModeIndex,
      cycle: cyclePhotosMode,
      registerPhotoCount: registerPhotosModeCount,
    };
  }, [
    useSlidePanel,
    enterPhotosMode,
    photosModeActive,
    photosModeIndex,
    cyclePhotosMode,
    registerPhotosModeCount,
  ]);

  useEffect(() => {
    setPhotosTabVisible(false);
    setPhotosModeIndex(0);
    photosModeCountRef.current = 0;
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
      if (
        tab === "history" &&
        window.matchMedia("(min-width: 1024px)").matches
      ) {
        elevateHistoryPanel();
        return;
      }
      if (tab) {
        if (tab !== "history") setActiveDeckCard("remarks");
        setPanelTab(tab);
      }
    };
    applyHash();
    window.addEventListener("hashchange", applyHash);
    return () => window.removeEventListener("hashchange", applyHash);
  }, [useSlidePanel, subnav.mlsId, elevateHistoryPanel]);

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

  // Publish sticky chrome clearance (site nav top + chrome height) so the
  // mobile slide-up panel and scroll-margin targets clear the pinned tabs.
  useEffect(() => {
    const publish = () => {
      const el = stickyChromeRef.current;
      if (!el) return;
      const stickyTop = parseFloat(getComputedStyle(el).top) || 0;
      const height = el.offsetHeight;
      document.documentElement.style.setProperty(
        "--listing-sticky-offset",
        `${stickyTop + height + 12}px`,
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

  const shareHref = isSpotlight
    ? SPOTLIGHT_SHARE_URL
    : listingShareHref(header.mlsId);

  const shareButton = (
    <ListingShareButton
      href={shareHref}
      title={header.address?.street || header.address?.full || null}
    />
  );

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
      onMedianClick={activateAnalysisFromMedian}
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
    // Share sits left of the status pill on the Back / Spotlight row.
    shareHref: null,
    // Mobile: deprecate under-address type / year / beds / sqft — Overview
    // shows them in the lower floating dock only.
    hideFactsOnMobile: true,
  };

  const heroOnly = (
    <ListingHeader {...headerShared} parts="heroInsight" tabsSlot={null} />
  );

  const tabsNav = (
    <Suspense fallback={null}>
      <ListingSubnav
        {...subnav}
        isRental={
          header.isRental ??
          isRentalListing({ propertyType: header.propertyType })
        }
        embedded
        compact
        panelTab={useSlidePanel ? panelTab : null}
        onPanelOpen={useSlidePanel ? openPanel : null}
        onPanelClose={useSlidePanel ? closePanel : null}
        // Photos tab can still route to /photos; Overview photo clicks use
        // in-page photos mode via ListingPhotosModeContext (no remount).
        onPhotosSelect={null}
        forceShowPhotos={photosTabVisible}
        mapVisible={mapVisible}
        onMapToggle={toggleMap}
        adminVisible={
          isDesktopLayout ? activeDeckCard === "admin" : adminVisible
        }
        onAdminToggle={siteUnlocked ? toggleAdmin : null}
        showAdminTab={siteUnlocked}
        historyElevated={activeDeckCard === "history"}
        onHistoryToggle={
          useSlidePanel && isDesktopLayout ? toggleHistoryPanel : null
        }
        hideMobileEdgeTabs
      />
    </Suspense>
  );

  const panelOpen = useSlidePanel && panelTab != null;
  /** Sold / What if / UAG / … — hide Overview hero+map underlay so it can't bleed through. */
  const analysisPanelOpen =
    panelOpen && panelTab != null && panelTab !== "overview";

  const stickySurfaceClass = panelOpen
    ? "bg-[#1B2A4A]"
    : "bg-[#1B2A4A]/95 backdrop-blur-md";

  // Before locking document scroll: pin panel to the section label and seat the
  // sticky listing chrome so What if / Sold / … land under the tabs (not mid-page).
  useLayoutEffect(() => {
    if (!panelOpen) return;

    const pinToSectionLabel = () => {
      if (panelScrollRef.current) panelScrollRef.current.scrollTop = 0;
      const chrome = stickyChromeRef.current;
      if (!chrome) return;
      const stickyTop = parseFloat(getComputedStyle(chrome).top) || 0;
      const delta = chrome.getBoundingClientRect().top - stickyTop;
      if (Math.abs(delta) > 1) {
        window.scrollBy(0, delta);
      }
    };
    pinToSectionLabel();

    const html = document.documentElement;
    const body = document.body;
    const prevHtml = html.style.overflow;
    const prevBody = body.style.overflow;
    html.style.overflow = "hidden";
    body.style.overflow = "hidden";

    // Lazy section bodies (What if) mount after first paint — re-pin panel only
    // (window scroll is locked once overflow is hidden).
    const pinPanelOnly = () => {
      if (panelScrollRef.current) panelScrollRef.current.scrollTop = 0;
    };
    const t0 = window.setTimeout(pinPanelOnly, 50);
    const t1 = window.setTimeout(pinPanelOnly, 250);

    return () => {
      window.clearTimeout(t0);
      window.clearTimeout(t1);
      html.style.overflow = prevHtml;
      body.style.overflow = prevBody;
    };
  }, [panelOpen, panelTab]);

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

  // Mobile: fixed scrollport under sticky chrome. Desktop: absolute over hero.
  // Analysis tabs fill the stage so photo/map underlay cannot peek below 68vh.
  const slidePanel = useSlidePanel ? (
    <div
      className={
        panelOpen
          ? `z-20 flex flex-col border-0 bg-[#1B2A4A] shadow-[0_-12px_40px_-16px_rgba(0,0,0,0.55)] max-lg:fixed max-lg:inset-x-0 max-lg:top-[var(--listing-sticky-offset,6rem)] max-lg:bottom-0 lg:absolute lg:inset-x-0 lg:top-0 ${
              analysisPanelOpen
                ? "lg:bottom-0 lg:h-full lg:min-h-[min(68vh,calc(100dvh-var(--listing-sticky-offset,6rem)-1rem))]"
                : "lg:h-[min(68vh,calc(100dvh-var(--listing-sticky-offset,6rem)-1rem))]"
            }`
          : "pointer-events-none invisible absolute inset-x-0 top-0 z-20 h-0 max-h-0 translate-y-full overflow-hidden"
      }
      aria-hidden={!panelOpen}
    >
      {panelOpen ? (
        <div
          ref={panelScrollRef}
          id={LISTING_SECTION_IDS.overview}
          className={`listing-tab-panel min-h-0 flex-1 overflow-y-scroll overscroll-y-contain touch-pan-y pt-0 max-lg:px-0 lg:pt-2 lg:pb-4 ${
            showMobileMetaDock
              ? "pb-[calc(4.25rem+env(safe-area-inset-bottom,0px))] lg:pb-4"
              : "pb-4"
          }`}
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

  const heroStagePadClass = showMobileMetaDock
    ? "max-lg:pb-[calc(4.25rem+env(safe-area-inset-bottom,0px))]"
    : "";

  const heroStage = useSlidePanel ? (
    <div
      ref={stageRef}
      className={`relative mt-0 overflow-x-hidden ${heroStagePadClass} ${
        analysisPanelOpen
          ? "overflow-hidden bg-[#1B2A4A] min-h-[min(68vh,calc(100dvh-var(--listing-sticky-offset,6rem)-1rem))]"
          : "overflow-y-visible"
      }`}
    >
      {/* Keep Overview photo/map underlay only when not on an analysis tab. */}
      {analysisPanelOpen ? null : heroOnly}
      {slidePanel}
    </div>
  ) : (
    heroOnly
  );

  // No card shell — rounded/frosted frames read as medium-blue borders on the
  // navy page and around slide-up tab content.
  const remarksTeaserLine = firstListingRemarksLine(remarks);
  const showRemarksTeaser =
    remarksSurfaceActive && Boolean(remarksTeaserLine);
  const desktopDeckEnabled =
    isDesktopLayout && remarksSurfaceActive && Boolean(sidebar);

  useEffect(() => {
    if (!remarksSurfaceActive) collapseRemarks();
  }, [remarksSurfaceActive, collapseRemarks]);

  useEffect(() => {
    if (!desktopDeckEnabled) setActiveDeckCard("remarks");
  }, [desktopDeckEnabled]);

  const propertyPanel = (
    <div className="min-w-0 max-lg:w-full">
      {/* Meta + section tabs stay pinned under the site nav while photos/content scroll. */}
      <div
        ref={stickyChromeRef}
        className={`sticky ${STICKY_TOP_CLASS} z-30 overflow-visible pt-1 max-lg:px-3 ${stickySurfaceClass} shadow-[0_8px_24px_-12px_rgba(0,0,0,0.65)] ${
          subnav.active === "photos"
            ? "pb-0"
            : // Mobile Sold/Rented/UAG: less air under main tabs before sub-tabs.
              analysisPanelOpen
              ? "pb-1 lg:pb-3"
              : "pb-3"
        }`}
      >
        {/* Share + status top-aligned with Spotlight Properties / ← Back to … */}
        <div className="mb-1.5 flex items-start justify-between gap-3">
          <div className="min-w-0">{topLeft}</div>
          <div className="flex shrink-0 items-center gap-1.5 self-start">
            {shareButton}
            {statusBadge}
          </div>
        </div>

        {/*
          Meta + tabs share one positioning context for the mobile edge pills.
          Insight is anchored just below the compact price (with a little
          clearance); Details → What if → Map move with it as one stack (price
          is the anchor — not Map on the tabs row). History lives inside the
          Insight drawer on mobile. What if / History / Map stay off the tab
          strip (hideMobileEdgeTabs).
        */}
        <div className="relative">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
            <div className="min-w-0 flex-1">
              <p className="mb-1.5 font-mono text-[10px] tracking-[0.2em] uppercase text-gold">
                Property Details
              </p>
              <ListingHeader {...headerShared} parts="meta" tabsSlot={null} />
            </div>
            {insightColumn}
          </div>

          <div className="relative mt-2">
            <div className="min-w-0 max-lg:pr-16">{tabsNav}</div>
          </div>

          <div
            className="lg:hidden absolute right-0 top-[3.5rem] z-10 max-lg:-mr-3 flex flex-col items-end gap-0"
            role="toolbar"
            aria-label="Listing panels"
          >
            {(
              [
                {
                  id: "insight" as const,
                  label: "Insight",
                  active: mobileDrawer === "insight",
                  controls: "listing-insight-drawer",
                  onClick: () => {
                    if (mobileDrawer === "insight") {
                      closeMobileDrawer();
                      return;
                    }
                    openMobileDrawer("insight");
                  },
                },
                {
                  id: "details" as const,
                  label: "Details",
                  active: mobileDrawer === "details",
                  controls: "listing-details-drawer",
                  onClick: () => {
                    if (mobileDrawer === "details") {
                      closeMobileDrawer();
                      return;
                    }
                    openMobileDrawer("details");
                  },
                },
                {
                  id: "if" as const,
                  label: "What if",
                  active:
                    panelTab === "if" ||
                    (!useSlidePanel && subnav.active === "if"),
                  controls: LISTING_SECTION_IDS.if,
                  onClick: () => openMobileSectionPill("if"),
                },
                {
                  id: "map" as const,
                  label: "Map",
                  active: mapVisible,
                  controls: "listing-map-drawer",
                  onClick: () => {
                    if (mapVisible) {
                      closeMap();
                      return;
                    }
                    openMobileMap();
                  },
                },
              ] satisfies {
                id: MobileEdgePillId;
                label: string;
                active: boolean;
                controls: string;
                onClick: () => void;
              }[]
            ).map((pill) => (
              <button
                key={pill.id}
                type="button"
                className={`inline-flex w-fit items-center justify-end rounded-l-full rounded-r-none border border-r-0 pl-3.5 pr-2.5 py-1.5 font-mono text-[9px] uppercase tracking-[0.16em] shadow-[-4px_2px_12px_-4px_rgba(0,0,0,0.55)] transition-colors ${
                  pill.active
                    ? "border-gold bg-navy text-gold"
                    : "border-gold/45 bg-[#121c2e]/95 text-gold/90 hover:border-gold hover:bg-navy hover:text-gold"
                }`}
                aria-pressed={pill.active}
                aria-controls={pill.controls}
                onClick={pill.onClick}
              >
                {pill.label}
              </button>
            ))}
          </div>
        </div>

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
                setActiveDeckCard("remarks");
                expandRemarks();
                return;
              }
              setMapVisible(false);
              setMobileDrawer((prev) =>
                prev === "remarks" ? null : "remarks",
              );
            }}
            className="mt-2 w-full min-w-0 max-lg:pr-28 text-left text-[11px] leading-snug text-white/70 underline decoration-white/45 underline-offset-2 transition-colors hover:text-gold hover:decoration-gold/50 focus:outline-none focus-visible:text-gold"
            aria-expanded={
              isDesktopLayout
                ? activeDeckCard === "remarks" && remarksExpanded
                : mobileDrawer === "remarks"
            }
            title={
              isDesktopLayout
                ? "Open listing remarks in the card deck"
                : "Open listing remarks"
            }
          >
            {/*
              Mobile: reserve space for the absolute What if / Map edge pills so
              the teaser truncates with an ellipsis instead of running under them.
            */}
            <span className="block truncate">
              {remarksTeaserLine}
            </span>
          </button>
        ) : null}
      </div>

      <ListingPhotosModeContext.Provider value={photosModeApi}>
        {heroStage}
      </ListingPhotosModeContext.Provider>
      {/*
        Photos page: keep the gallery in this column, flush under the tab strip.
        A separate grid row still picks up gap-y (and on mobile an empty right-column
        track doubles it) — the Intelligence → /photos deep-link hit that gap.
      */}
      {subnav.active === "photos" && !useSlidePanel && belowTabs ? (
        <div className="min-w-0">{belowTabs}</div>
      ) : null}
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

  // Desktop Overview: Remarks / Details / History / Admin as a peeking card deck.
  const remarksPanel = remarksSurfaceActive ? (
    <ListingRemarksSidePanel
      remarks={remarks}
      frameClass={frameClass}
      expanded={remarksExpanded}
      onExpand={expandRemarks}
      onCollapse={collapseRemarks}
    />
  ) : null;

  const deckCardShell = (cardId: ListingDesktopDeckCardId, child: ReactNode) => {
    const expanded = activeDeckCard === cardId;
    return (
      <div
        className={`relative shrink-0 transition-[box-shadow,transform] duration-300 ${
          expanded
            ? "z-30 shadow-[0_12px_28px_-16px_rgba(0,0,0,0.65)]"
            : "z-10"
        }`}
      >
        {child}
      </div>
    );
  };

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
      {/*
        Card deck: each panel’s header peeks under the next (-mt overlap).
        Only the active card’s body expands; minimize returns it to a top strip.
      */}
      {desktopDeckEnabled ? (
        <div className="flex min-w-0 flex-col">
          {remarksPanel
            ? deckCardShell("remarks", remarksPanel)
            : null}
          {sidebar ? (
            <div className={remarksPanel ? "-mt-2" : undefined}>
              {deckCardShell("details", <div className="shrink-0">{sidebar}</div>)}
            </div>
          ) : null}
          <div className="-mt-2">
            {deckCardShell(
              "history",
              <ListingHistorySidePanel
                mlsId={subnav.mlsId}
                townHint={subnav.townHint}
                frameClass={frameClass}
              />,
            )}
          </div>
          {siteUnlocked ? (
            <div className="-mt-2">
              {deckCardShell(
                "admin",
                <ListingAdminAgentPanel
                  contact={adminAgentContact}
                  deckMode
                />,
              )}
            </div>
          ) : null}
        </div>
      ) : (
        <>
          {remarksPanel}
          {isDesktopLayout && sidebar ? (
            <div className="shrink-0">{sidebar}</div>
          ) : null}
        </>
      )}
      {mapVisible ? mapBlock("aspect-square", true) : null}
    </div>
  );

  // Legacy: non-overview pages still put content in belowTabs page flow.
  // Overview + sections uses the slide-up panel only (no long page scroll).
  // Photos: rendered inside propertyPanel (flush under tabs) — not this row.
  const belowTabsBlock =
    !useSlidePanel && belowTabs && subnav.active !== "photos" ? (
      <div
        id={
          subnav.active === "overview" ? LISTING_SECTION_IDS.overview : undefined
        }
        className="mt-3 scroll-mt-[var(--listing-sticky-offset,6rem)] border-t border-white/10 pt-3"
      >
        {belowTabs}
      </div>
    ) : null;

  return (
    <ListingCriteriaVisibilityProvider>
      <ListingDesktopDeckProvider
        enabled={desktopDeckEnabled}
        activeCard={activeDeckCard}
        onActiveCardChange={setActiveDeckCard}
      >
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

      {showMobileMetaDock ? (
        <div
          className="pointer-events-none fixed inset-x-0 bottom-0 z-30 lg:hidden"
          aria-label="Property facts"
        >
          <div className="pointer-events-auto border-t border-white/10 bg-[#1B2A4A]/95 px-3 pt-2.5 pb-[max(0.65rem,env(safe-area-inset-bottom,0px))] shadow-[0_-8px_24px_-12px_rgba(0,0,0,0.55)] backdrop-blur-md">
            <ListingPropertyFacts
              propertyType={header.propertyType}
              style={header.style}
              beds={header.beds}
              baths={header.baths}
              sqft={header.sqft}
              yearBuilt={header.yearBuilt}
              bedBathSearchHref={header.bedBathSearchHref}
            />
          </div>
        </div>
      ) : null}

      {/* Mobile edge pills open Insight / Details / Map drawers; remarks via teaser. */}
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
        <div id="listing-insight-drawer" className="space-y-5">
          {overviewInsight ? (
            <ListingInsightCopy
              text={overviewInsight}
              className="text-left text-sm leading-relaxed text-white/80 break-words"
              medianHref={`#${LISTING_ANALYSIS_ID}`}
              onMedianClick={activateAnalysisFromMedian}
            />
          ) : null}
          <section
            className="space-y-3 border-t border-white/10 pt-4"
            aria-label="History"
          >
            <p className="font-mono text-[10px] tracking-[0.2em] uppercase text-gold">
              History
            </p>
            <ListingHistoryPanel
              mlsId={subnav.mlsId}
              townHint={subnav.townHint}
              variant="page"
            />
          </section>
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
        open={siteUnlocked && adminVisible && !isDesktopLayout}
        onClose={() => {
          if (window.matchMedia("(min-width: 1024px)").matches) return;
          setAdminVisible(false);
        }}
        title="Admin"
      >
        <ListingAdminAgentPanel contact={adminAgentContact} />
      </ListingSideDrawer>

      <ListingSideDrawer
        open={mobileDrawer === "details" && !isDesktopLayout}
        onClose={closeMobileDrawer}
        title="Details"
      >
        <div id="listing-details-drawer">{detailsBlock}</div>
      </ListingSideDrawer>
      </ListingDesktopDeckProvider>
    </ListingCriteriaVisibilityProvider>
  );
}
