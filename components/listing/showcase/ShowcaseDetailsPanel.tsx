"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ListingDesktopDeckProvider,
  type ListingDesktopDeckCardId,
} from "@/components/listing/ListingDesktopDeckContext";
import ListingHistorySidePanel from "@/components/listing/ListingHistorySidePanel";
import ListingInterestButton from "@/components/listing/ListingInterestButton";
import ListingRemarksSidePanel, {
  useListingRemarksExpand,
} from "@/components/listing/ListingRemarksSidePanel";
import ListingSidebar from "@/components/listing/ListingSidebar";
import ListingThumbImage from "@/components/ListingThumbImage";
import { listingPanelCompactClass } from "@/components/listing/listing-frame";
import { useIsDesktop } from "@/components/listing/showcase/use-is-desktop";
import { buildListingDetailsPanelProps } from "@/lib/listing-detail-panel-props";
import { fmtMoney } from "@/lib/listing-history";
import type { ListingScoreApiFields } from "@/lib/listing-header-score-props";
import { DealBoardStatusBadge } from "@/components/intelligence/deal-board/deal-board-shared";
import ListingHistoryPanel from "@/components/ListingHistoryPanel";
import { ListingComparablesPageContent } from "@/components/listing/ListingComparablesPanel";
import ListingHeader from "@/components/listing/ListingHeader";
import { ListingIfPageContent } from "@/components/listing/ListingIfPanel";
import { ListingUagPageContent } from "@/components/listing/ListingUagPanel";
import { ListingInsightCopy } from "@/components/listing/ListingInsightCopy";
import { LISTING_CRITERIA_SLOT_ID } from "@/components/listing/ListingCriteriaSideLayout";
import { ListingBackLink } from "@/components/listing/ListingShell";
import ShowcaseCompsMap from "@/components/listing/showcase/ShowcaseCompsMap";
import ListingSubnav, {
  type ListingTab,
} from "@/components/listing/ListingSubnav";
import { listingCriteriaLinkSlotId } from "@/components/listing/ListingCriteriaSideLayout";
import { LISTING_SECTION_IDS } from "@/components/listing/listing-section-ids";
import {
  SHOWCASE_SECTION_IDS,
  scrollToShowcaseSection,
  showcaseSectionForTab,
} from "@/components/listing/showcase/showcase-sections";
import type {
  ShowcaseDetailRow,
  ShowcaseListing,
} from "@/components/listing/showcase/showcase-types";
import { intelligenceSearchHrefFromListing } from "@/lib/intelligence-search-url";
import {
  formatMlsStatus,
  primaryListingPrice,
  primaryListingPriceIsClosed,
} from "@/lib/listing-history";
import { listingHeaderScoreProps } from "@/lib/listing-header-score-props";
import {
  listingPhotoProxyUrl,
  listingSectionHref,
  listingShareHref,
} from "@/lib/listing-url";

type TransactionTab = "comparables" | "comparable-rentals" | "uag";

function isTransactionTab(tab: ListingTab): tab is TransactionTab {
  return tab === "comparables" || tab === "comparable-rentals" || tab === "uag";
}

const TRANSACTION_TITLES: Record<TransactionTab, string> = {
  comparables: "Sold comparables",
  "comparable-rentals": "Rented comparables",
  uag: "Under agreement",
};

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="font-mono text-[10px] uppercase tracking-[0.3em] text-gold">
      {children}
    </h2>
  );
}

function Section({
  id,
  title,
  criteriaSlotId,
  children,
}: {
  id: string;
  title: string;
  /**
   * Portal target for the section's Criteria toggle. Production renders this
   * beside its section H2; without it `ListingCriteriaSideLayout` falls back to
   * a full-width row above the body, which pushes everything down.
   */
  criteriaSlotId?: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-24 border-t border-white/10 pt-5">
      <div className="flex items-baseline justify-between gap-4">
        <SectionHeading>{title}</SectionHeading>
        {criteriaSlotId ? (
          <div id={criteriaSlotId} className="flex shrink-0 justify-end" />
        ) : null}
      </div>
      <div className="mt-3">{children}</div>
    </section>
  );
}

/**
 * Everything below the photo. Kept out of the page component so the panel can
 * evolve on its own — including diverging further for mobile — without
 * touching the hero or the rotation logic.
 */
export default function ShowcaseDetailsPanel({
  listing,
  street,
  city,
  addressHint,
  insight,
  remarks,
  detailRows,
  isRental,
  photoCount,
  onSelectPhoto,
  score,
}: {
  listing: ShowcaseListing;
  street: string;
  city: string;
  addressHint?: string | null;
  insight: string | null;
  remarks: string;
  detailRows: ShowcaseDetailRow[];
  isRental: boolean;
  photoCount: number;
  /** Sends the hero back to a chosen photo — keeps Photos on this page. */
  onSelectPhoto: (index: number) => void;
  /** Score + median-band fields straight off the listing chrome API. */
  score: ListingScoreApiFields;
}) {
  const router = useRouter();
  const stickyRef = useRef<HTMLDivElement | null>(null);
  const [activeDeckCard, setActiveDeckCard] =
    useState<ListingDesktopDeckCardId | null>("remarks");
  const remarksExpand = useListingRemarksExpand();
  const isDesktop = useIsDesktop();
  /**
   * Sold / Rented / Under Agreement share one section, so the tab has to pick
   * which body renders — otherwise Rented and UAG scroll to a section still
   * showing sold comps and look like they did nothing.
   */
  const [txTab, setTxTab] = useState<TransactionTab>("comparables");
  const [activeTab, setActiveTab] = useState<ListingTab>("overview");
  /** Desktop only — the Overview tab reveals the remarks as a full-width block. */
  const [showOverviewSection, setShowOverviewSection] = useState(false);
  const { goldilocksScore, goldilocksBreakdown } = score;
  const status = formatMlsStatus(listing.status);

  /**
   * Publish the sticky chrome's height so anchors below it — ours and the ones
   * inside the comps body — can set a matching scroll-margin. Mirrors the
   * `--listing-sticky-offset` mechanism in ListingHeroPanels.
   */
  useEffect(() => {
    const el = stickyRef.current;
    if (!el) return;
    const publish = () => {
      const stickyTop = window.innerWidth >= 1024 ? 96 : 80;
      document.documentElement.style.setProperty(
        "--showcase-sticky-offset",
        `${stickyTop + el.offsetHeight + 12}px`,
      );
    };
    publish();
    const ro = new ResizeObserver(publish);
    ro.observe(el);
    window.addEventListener("resize", publish);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", publish);
      document.documentElement.style.removeProperty("--showcase-sticky-offset");
    };
  }, []);
  const subject =
    listing.latitude != null && listing.longitude != null
      ? {
          key: listing.listingKey || listing.mlsId,
          address: street,
          city,
          price: primaryListingPrice(listing) ?? 0,
          score: goldilocksScore ?? 0,
          isRental,
          beds: listing.beds,
          baths: listing.baths,
          sqft: listing.sqft,
          latitude: listing.latitude,
          longitude: listing.longitude,
          photoCount: listing.photoCount,
        }
      : null;

  /**
   * Without this the subnav drops into hash-jump mode and every content tab
   * resolves to the Overview route plus an anchor, bouncing the visitor off
   * this page. Tabs that have a section here scroll to it; the rest navigate.
   */
  const handleTabSelect = (tab: ListingTab) => {
    if (tab === "admin") return;
    if (isTransactionTab(tab)) setTxTab(tab);
    // Overview content *is* the remarks, which live in the dashboard deck on
    // desktop — open that card rather than scrolling to an empty anchor.
    if (isDesktop) {
      // Overview shows the remarks in the main column, so the deck moves to
      // Details — one card is open at a time, which minimises Remarks and puts
      // the property facts alongside the copy instead of duplicating it.
      // Desktop only: mobile has no deck and no room for a second column.
      setShowOverviewSection(tab === "overview");
      if (tab === "overview") setActiveDeckCard("details");
    }
    const section = showcaseSectionForTab(tab);
    if (section) {
      setActiveTab(tab);
      scrollToShowcaseSection(section);
      return;
    }
    router.push(listingSectionHref(listing.mlsId, tab, street, city));
  };

  /** Deck cards overlap by their header strip, as on production Overview. */
  const deckCard = (
    child: React.ReactNode,
    cardId: ListingDesktopDeckCardId,
  ) => (
    // `w-full` matters: without it the Details card sizes to its own content
    // and ends up a different width from Remarks and History.
    <div
      className={`relative w-full min-w-0 shrink-0 transition-[box-shadow] duration-300 ${
        activeDeckCard === cardId
          ? "z-30 shadow-[0_12px_28px_-16px_rgba(0,0,0,0.65)]"
          : "z-10"
      }`}
    >
      {child}
    </div>
  );

  const detailsPanelProps = buildListingDetailsPanelProps(
    { ...listing, townHint: city },
    fmtMoney,
    {
      listingId: listing.mlsId,
      addressHint: street || addressHint,
      townHint: city,
      cityMedianPpsf: score.cityMedianPpsf,
      listingPricePerSqft: score.pricePerSqft,
      medianPpsfBand: score.medianPpsfBand,
      marketBandLabel: score.marketBandLabel,
    },
  );

  return (
    <ListingDesktopDeckProvider
      activeCard={activeDeckCard}
      onActiveCardChange={setActiveDeckCard}
    >
      <section className="showcase-details navy-gradient relative border-t border-white/10 px-4 py-12 sm:px-8 lg:px-12 lg:py-16">
        <div className="absolute inset-0 hero-grid opacity-20" aria-hidden />
        <div className="relative mx-auto w-full max-w-7xl">
          {/*
          Desktop: the summary and tab strip pin once you scroll past them, so
          the tabs act as a nav rail for the panels below. Static on mobile —
          that layout is being reviewed separately.
        */}
          <div
            ref={stickyRef}
            className="showcase-sticky-chrome sticky top-20 z-30 lg:top-24"
          >
            <div className="mb-2 flex items-start justify-between gap-3">
              <ListingBackLink className="mb-0" />
              <span className="shrink-0">
                <DealBoardStatusBadge
                  status={status}
                  size="sm"
                  surface="listing"
                />
              </span>
            </div>

            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between lg:gap-6">
              <div className="min-w-0 flex-1">
                <p className="mb-1.5 font-mono text-[10px] tracking-[0.2em] uppercase text-gold">
                  Property Details
                </p>
                <ListingHeader
                  parts="meta"
                  mlsId={listing.mlsId}
                  status={listing.status}
                  address={listing.address}
                  propertyType={listing.propertyType}
                  style={listing.style}
                  beds={listing.beds}
                  baths={listing.baths}
                  sqft={listing.sqft}
                  yearBuilt={listing.yearBuilt}
                  modificationTimestamp={listing.modificationTimestamp}
                  price={primaryListingPrice(listing)}
                  priceIsClosed={primaryListingPriceIsClosed(listing)}
                  bedBathSearchHref={intelligenceSearchHrefFromListing(listing)}
                  shareHref={listingShareHref(listing.mlsId)}
                  compact
                  {...listingHeaderScoreProps({
                    goldilocksScore,
                    goldilocksBreakdown,
                    insight,
                    title: street,
                    subtitle: city,
                    propertyType: listing.propertyType,
                  })}
                />
              </div>

              {/* Production places Insight beside Property Details on desktop. */}
              {insight ? (
                <aside
                  className="hidden min-w-0 lg:block lg:max-w-sm"
                  aria-label="Listing insight"
                >
                  <p className="mb-1 font-mono text-[10px] tracking-[0.2em] uppercase text-gold lg:text-center">
                    Insight
                  </p>
                  <ListingInsightCopy
                    text={insight}
                    className="text-left text-[11px] leading-snug text-white/70 break-words"
                  />
                </aside>
              ) : null}
            </div>

            {/*
            Desktop keeps History in the dashboard deck, so its tab toggles the
            card and lights up with it — the same wiring ListingHeroPanels uses.
            Null on mobile, where the tab falls through to the stacked section.
          */}
            <div className="mt-2">
              <ListingSubnav
                mlsId={listing.mlsId}
                active={activeTab}
                addressHint={street || addressHint}
                townHint={city}
                isRental={isRental}
                embedded
                compact
                onTabSelect={handleTabSelect}
                onMapToggle={() => scrollToShowcaseSection("map")}
                historyElevated={activeDeckCard === "history"}
                onHistoryToggle={
                  isDesktop
                    ? () =>
                        setActiveDeckCard((cur) =>
                          cur === "history" ? null : "history",
                        )
                    : null
                }
              />
            </div>
          </div>

          {/*
          Desktop splits into main content + a sticky dashboard, matching the
          production Overview grid. Remarks / Details / History live in the
          dashboard there; below `lg` they stay as stacked sections, since the
          mobile layout is being reviewed separately.
        */}
          {/* Always-present anchor: the mobile remarks block below is display:
              none at `lg`, and you cannot scroll to a hidden element. */}
          <div id={SHOWCASE_SECTION_IDS.overview} aria-hidden />

          <div className="mt-6 grid grid-cols-1 items-start gap-x-10 gap-y-6 lg:grid-cols-[minmax(0,1fr)_min(22rem,32vw)]">
            <div className="flex min-w-0 flex-col gap-6 lg:col-start-1">
              <section className={showOverviewSection ? undefined : "lg:hidden"}>
                {remarks ? (
                  <p className="whitespace-pre-line text-base leading-relaxed text-white/80">
                    {remarks}
                  </p>
                ) : (
                  <p className="text-base text-white/50">
                    No public remarks on this listing.
                  </p>
                )}
              </section>

              <Section id={SHOWCASE_SECTION_IDS.insight} title="Insight">
                {insight ? (
                  <ListingInsightCopy text={insight} />
                ) : (
                  <p className="text-sm text-white/50">
                    No insight for this listing.
                  </p>
                )}
              </Section>

              <div className="lg:hidden">
                <Section id={SHOWCASE_SECTION_IDS.details} title="Details">
                  <dl className="divide-y divide-white/10 border-y border-white/10">
                    {detailRows.map((row) => (
                      <div
                        key={row.label}
                        className="flex items-baseline justify-between gap-6 py-3"
                      >
                        <dt className="font-mono text-[10px] uppercase tracking-[0.2em] text-white/45">
                          {row.label}
                        </dt>
                        <dd className="text-right text-sm text-white/90">
                          {row.value}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </Section>
              </div>

              {/* Self-contained gallery: the full-bleed hero is the viewer, so a
              thumbnail jumps it rather than opening the /photos route. */}
              <Section id={SHOWCASE_SECTION_IDS.photos} title="Photos">
                {photoCount > 0 ? (
                  <div className="grid grid-cols-3 gap-1 sm:grid-cols-4 lg:grid-cols-5">
                    {Array.from(
                      { length: Math.min(photoCount, 40) },
                      (_, i) => (
                        <button
                          key={i}
                          type="button"
                          onClick={() => onSelectPhoto(i)}
                          aria-label={`Show photo ${i + 1} of ${photoCount}`}
                          className="relative aspect-[4/3] overflow-hidden transition-opacity hover:opacity-80"
                        >
                          <ListingThumbImage
                            src={listingPhotoProxyUrl(listing.mlsId, i)}
                            alt=""
                            priority={i < 10}
                          />
                        </button>
                      ),
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-white/50">
                    No photos on this listing.
                  </p>
                )}
              </Section>

              <Section
                id={SHOWCASE_SECTION_IDS.comps}
                title={TRANSACTION_TITLES[txTab]}
                criteriaSlotId={listingCriteriaLinkSlotId(
                  LISTING_SECTION_IDS[txTab],
                )}
              >
                {/* Same bodies the Overview slide panel and the dedicated
                /comparables and /uag routes render. */}
                {txTab === "uag" ? (
                  <ListingUagPageContent
                    mlsId={listing.mlsId}
                    townHint={city}
                    suppressPageChrome
                  />
                ) : (
                  <ListingComparablesPageContent
                    mlsId={listing.mlsId}
                    townHint={city}
                    kind={txTab === "comparable-rentals" ? "rental" : "sale"}
                    suppressPageChrome
                  />
                )}
              </Section>

              <Section
                id={SHOWCASE_SECTION_IDS.if}
                title="What if"
                criteriaSlotId={listingCriteriaLinkSlotId(
                  LISTING_SECTION_IDS.if,
                )}
              >
                <ListingIfPageContent
                  mlsId={listing.mlsId}
                  addressHint={street || addressHint}
                  townHint={city}
                  isRental={isRental}
                  suppressPageChrome
                />
              </Section>

              <div className="lg:hidden">
                <Section id={SHOWCASE_SECTION_IDS.history} title="History">
                  <ListingHistoryPanel
                    mlsId={listing.mlsId}
                    townHint={city}
                    variant="page"
                  />
                </Section>
              </div>

              <Section id={SHOWCASE_SECTION_IDS.map} title="Map">
                {/* `variant="hero"` fills its parent, so the height has to come
                from here or the map collapses to nothing. */}
                {/* Same deal-board engine as Intelligence: real pan / wheel zoom
                and a pin per comparable, with the subject alongside them. */}
                <div className="h-[20rem] w-full sm:h-[26rem]">
                  <ShowcaseCompsMap
                    mlsId={listing.mlsId}
                    subject={subject}
                    townHint={city}
                    postalCode={listing.address.postalCode}
                  />
                </div>
              </Section>
            </div>

            <aside
              className="hidden min-w-0 lg:col-start-2 lg:block lg:self-stretch"
              aria-label="Listing dashboard"
            >
              <div className="sticky flex flex-col gap-4 lg:top-[var(--showcase-sticky-offset,12rem)]">
                {/* Anchors the column width above the deck, as on production. */}
                {detailsPanelProps.isClosed ? null : (
                  <ListingInterestButton
                    mlsId={listing.mlsId}
                    address={street}
                    city={city}
                  />
                )}
                <div className="flex min-w-0 flex-col">
                  {deckCard(
                    <ListingRemarksSidePanel
                      remarks={remarks || null}
                      frameClass={listingPanelCompactClass}
                      expanded={remarksExpand.expanded}
                      onExpand={remarksExpand.expand}
                      onCollapse={remarksExpand.collapse}
                    />,
                    "remarks",
                  )}
                  <div className="-mt-2">
                    {deckCard(
                      <ListingSidebar details={detailsPanelProps} />,
                      "details",
                    )}
                  </div>
                  <div className="-mt-2">
                    {deckCard(
                      <ListingHistorySidePanel
                        mlsId={listing.mlsId}
                        townHint={city}
                        frameClass={listingPanelCompactClass}
                      />,
                      "history",
                    )}
                  </div>
                </div>
              </div>
            </aside>
          </div>
        </div>

        {/*
        Criteria portals itself here on desktop (ListingCriteriaSideLayout);
        production supplies this slot from the sticky sidebar in
        ListingHeroPanels, which this page does not render — without it the
        Criteria toggle appears but has nowhere to draw and looks broken.
        `empty:hidden` keeps it invisible until the portal fills it, so it
        behaves as a pop-out rather than a reserved column. Mobile is unaffected:
        that path already uses ListingSideDrawer.
      */}
        {/* `space-y-3` because Comps and What if are both on-screen here, so both
          panels can portal in at once — unlike the production tabs, where only
          the active one is ever mounted. */}
        <div
          id={LISTING_CRITERIA_SLOT_ID}
          className="fixed right-4 top-28 z-40 max-h-[70vh] w-[min(22rem,calc(100vw-2rem))] space-y-3 overflow-y-auto empty:hidden lg:top-[var(--showcase-sticky-offset,12rem)]"
        />
      </section>
    </ListingDesktopDeckProvider>
  );
}
