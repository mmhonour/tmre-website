"use client";

import dynamic from "next/dynamic";
import { useEffect } from "react";
import ListingHistoryPanel from "@/components/ListingHistoryPanel";
import { listingCriteriaLinkSlotId, useListingDesktopLayout } from "@/components/listing/ListingCriteriaSideLayout";
import {
  LISTING_SECTION_IDS,
  type ListingScrollSectionTab,
} from "@/components/listing/listing-section-ids";

const ListingIfPageContent = dynamic(
  () =>
    import("@/components/listing/ListingIfPanel").then((m) => ({
      default: m.ListingIfPageContent,
    })),
  {
    loading: () => (
      <p className="text-sm text-slate-500 py-6">Loading What if…</p>
    ),
    ssr: false,
  },
);

const ListingComparablesPageContent = dynamic(
  () =>
    import("@/components/listing/ListingComparablesPanel").then((m) => ({
      default: m.ListingComparablesPageContent,
    })),
  {
    loading: () => (
      <p className="text-sm text-slate-500 py-6">Loading comps…</p>
    ),
    ssr: false,
  },
);

const ListingUagPageContent = dynamic(
  () =>
    import("@/components/listing/ListingUagPanel").then((m) => ({
      default: m.ListingUagPageContent,
    })),
  {
    loading: () => (
      <p className="text-sm text-slate-500 py-6">Loading under agreement…</p>
    ),
    ssr: false,
  },
);

type Props = {
  mlsId: string;
  addressHint?: string | null;
  townHint?: string | null;
  routeBase?: "listing" | "spotlight";
  /** Spotlight property query (`property=…`) for comps / UAG APIs. */
  propertyParam?: string | null;
  /**
   * `stack` — continuous page sections (legacy /test).
   * `panel` — show/hide a single section inside the slide-up overlay.
   */
  mode?: "stack" | "panel";
  /** Which section to show when `mode="panel"`. Overview is handled by the parent. */
  activeTab?: ListingScrollSectionTab | null;
};

function Section({
  id,
  title,
  children,
  hidden = false,
  compact = false,
  /** Portal mount for Criteria / Hide criteria (top-aligned with title). */
  criteriaLinkSlotId = null,
  /**
   * When true, the title-row Criteria mount is desktop-only — Sold / Rented /
   * UAG keep an in-panel mount on mobile. What if keeps the title mount always.
   */
  criteriaLinkDesktopOnly = false,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
  hidden?: boolean;
  /** Panel mode: no divider / top margin under the tab row. */
  compact?: boolean;
  criteriaLinkSlotId?: string | null;
  criteriaLinkDesktopOnly?: boolean;
}) {
  const isDesktop = useListingDesktopLayout();
  const showTitleCriteriaSlot =
    Boolean(criteriaLinkSlotId) &&
    (criteriaLinkDesktopOnly ? isDesktop === true : true);

  return (
    <section
      id={id}
      hidden={hidden}
      className={
        compact
          ? // Panel mode scrolls inside the overlay (already below sticky chrome).
            // scroll-margin here would push the section label out of view.
            undefined
          : "scroll-mt-[var(--listing-sticky-offset,6rem)] border-t border-white/10 pt-5 mt-6 first:mt-0 first:border-t-0 first:pt-0"
      }
    >
      <div
        className={`flex items-start justify-between gap-3 max-lg:px-3 lg:px-0 ${
          compact ? "mb-1" : "mb-2"
        }`}
      >
        <h2
          className={
            compact
              ? "font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-gold text-left leading-none"
              : "text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500 text-left leading-none"
          }
        >
          {title}
        </h2>
        {showTitleCriteriaSlot ? (
          <div
            id={criteriaLinkSlotId!}
            className="flex shrink-0 items-start justify-end min-h-[1em]"
          />
        ) : null}
      </div>
      {children}
    </section>
  );
}

function scrollToHashTarget() {
  if (typeof window === "undefined") return false;
  const hash = window.location.hash.replace(/^#/, "");
  if (!hash) return false;
  const el = document.getElementById(hash);
  if (!el) return false;
  el.scrollIntoView({ behavior: "smooth", block: "start" });
  return true;
}

/**
 * Listing / Spotlight section bodies: History → What if → Sold → Rented → UAG.
 * In panel mode, only the active tab’s section is visible (no page scroll).
 */
export function ListingMobileScrollSections({
  mlsId,
  addressHint,
  townHint,
  routeBase = "listing",
  propertyParam = null,
  mode = "stack",
  activeTab = null,
}: Props) {
  const isPanel = mode === "panel";
  const salesParams = new URLSearchParams();
  const rentalsParams = new URLSearchParams();
  rentalsParams.set("kind", "rental");
  const uagParams = new URLSearchParams();
  if (propertyParam) {
    salesParams.set("property", propertyParam);
    rentalsParams.set("property", propertyParam);
    uagParams.set("property", propertyParam);
  }

  const salesFetchUrl =
    routeBase === "spotlight"
      ? `/api/spotlight/comparables${salesParams.toString() ? `?${salesParams}` : ""}`
      : undefined;
  const rentalsFetchUrl =
    routeBase === "spotlight"
      ? `/api/spotlight/comparables?${rentalsParams}`
      : undefined;
  const uagFetchUrl =
    routeBase === "spotlight"
      ? `/api/spotlight/uag${uagParams.toString() ? `?${uagParams}` : ""}`
      : undefined;

  // Stack mode only: deep-link / tab jump scrolls the page once the section exists.
  useEffect(() => {
    if (isPanel) return;
    if (scrollToHashTarget()) return;
    const started = Date.now();
    const id = window.setInterval(() => {
      if (scrollToHashTarget() || Date.now() - started > 6000) {
        window.clearInterval(id);
      }
    }, 120);
    return () => window.clearInterval(id);
  }, [mlsId, isPanel]);

  const show = (tab: ListingScrollSectionTab) =>
    !isPanel || activeTab === tab;

  return (
    <div className={isPanel ? "space-y-0" : "mt-8 space-y-0"}>
      <Section
        id={LISTING_SECTION_IDS.history}
        title="History"
        hidden={!show("history")}
        compact={isPanel}
      >
        <ListingHistoryPanel
          mlsId={mlsId}
          townHint={townHint}
          variant="page"
        />
      </Section>
      <Section
        id={LISTING_SECTION_IDS.if}
        title="What if"
        hidden={!show("if")}
        criteriaLinkSlotId={listingCriteriaLinkSlotId(LISTING_SECTION_IDS.if)}
        compact={isPanel}
      >
        <ListingIfPageContent
          mlsId={mlsId}
          addressHint={addressHint}
          townHint={townHint}
          routeBase={routeBase}
          suppressPageChrome={isPanel}
        />
      </Section>
      <Section
        id={LISTING_SECTION_IDS.comparables}
        title="Sold"
        hidden={!show("comparables")}
        compact={isPanel}
        criteriaLinkSlotId={listingCriteriaLinkSlotId(
          LISTING_SECTION_IDS.comparables,
        )}
        criteriaLinkDesktopOnly
      >
        <ListingComparablesPageContent
          mlsId={mlsId}
          townHint={townHint}
          kind="sale"
          fetchUrl={salesFetchUrl}
          suppressPageChrome={isPanel}
        />
      </Section>
      <Section
        id={LISTING_SECTION_IDS["comparable-rentals"]}
        title="Rented"
        hidden={!show("comparable-rentals")}
        compact={isPanel}
        criteriaLinkSlotId={listingCriteriaLinkSlotId(
          LISTING_SECTION_IDS["comparable-rentals"],
        )}
        criteriaLinkDesktopOnly
      >
        <ListingComparablesPageContent
          mlsId={mlsId}
          townHint={townHint}
          kind="rental"
          fetchUrl={rentalsFetchUrl}
          suppressPageChrome={isPanel}
        />
      </Section>
      <Section
        id={LISTING_SECTION_IDS.uag}
        title="Under agreement"
        hidden={!show("uag")}
        compact={isPanel}
        criteriaLinkSlotId={listingCriteriaLinkSlotId(LISTING_SECTION_IDS.uag)}
        criteriaLinkDesktopOnly
      >
        <ListingUagPageContent
          mlsId={mlsId}
          townHint={townHint}
          fetchUrl={uagFetchUrl}
          suppressPageChrome={isPanel}
        />
      </Section>
    </div>
  );
}
