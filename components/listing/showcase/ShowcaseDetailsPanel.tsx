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
import type { ListingDetailsSchoolsPanelProps } from "@/components/listing/ListingDetailsSchoolsPanel";
import type { ListingVisionLink } from "@/lib/listing-vision-link-shared";
import type { ListingScoreApiFields } from "@/lib/listing-header-score-props";
import { DealBoardStatusBadge } from "@/components/intelligence/deal-board/deal-board-shared";
import ListingHistoryPanel from "@/components/ListingHistoryPanel";
import { ListingComparablesPageContent } from "@/components/listing/ListingComparablesPanel";
import ListingHeader from "@/components/listing/ListingHeader";
import { ListingIfPageContent } from "@/components/listing/ListingIfPanel";
import { ListingUagPageContent } from "@/components/listing/ListingUagPanel";
import ShowcaseInsightBody from "@/components/listing/showcase/ShowcaseInsightBody";
import { useSiteUnlocked } from "@/components/SiteUnlockProvider";
import ListingAdminAgentPanel from "@/components/listing/ListingAdminAgentPanel";
import { extractListingAgentContact } from "@/lib/listing-agent-contact";
import { LISTING_CRITERIA_SLOT_ID } from "@/components/listing/ListingCriteriaSideLayout";
import { ListingBackLink } from "@/components/listing/ListingShell";
import ListingLocationMap from "@/components/listing/ListingLocationMap";
import ListingMapSidePanel from "@/components/listing/ListingMapSidePanel";
import ShowcaseCompsMap from "@/components/listing/showcase/ShowcaseCompsMap";
import type { ShowcaseHost } from "@/components/listing/showcase/showcase-host";
import { listingShowcaseHostDefaults } from "@/components/listing/showcase/showcase-host";
import {
  listingPhotoObfuscationImgClass,
  listingPhotoObfuscationSizeForThumb,
  ListingPhotoObfuscationOverlay,
} from "@/components/listing/ListingPhotoObfuscation";
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
  insightFacts = null,
  remarks,
  detailRows,
  isRental,
  photoCount,
  detailsPanelProps,
  vision = null,
  onSelectPhoto,
  score,
  host: hostProp,
}: {
  listing: ShowcaseListing;
  street: string;
  city: string;
  addressHint?: string | null;
  insight: string | null;
  insightFacts?: string | null;
  remarks: string;
  detailRows: ShowcaseDetailRow[];
  isRental: boolean;
  photoCount: number;
  /** Built once by the host so the hero rail and this deck cannot drift. */
  detailsPanelProps: ListingDetailsSchoolsPanelProps;
  /** VGSI parcel pairing — Admin deck card only. */
  vision?: ListingVisionLink | null;
  /** Sends the hero back to a chosen photo — keeps Photos on this page. */
  onSelectPhoto: (index: number) => void;
  /** Score + median-band fields straight off the listing chrome API. */
  score: ListingScoreApiFields;
  /** Listing supplies defaults; Spotlight overrides privacy, routes, Interest. */
  host?: ShowcaseHost;
}) {
  const host = hostProp ?? {
    ...listingShowcaseHostDefaults(),
    headline: street,
    locationLine: city,
    photoAlt: street,
    street,
    city,
    addressHint: addressHint ?? null,
    townHint: city,
    ifAddressHint: street || addressHint || null,
    headerAddress: {
      street,
      full: street,
      city,
      state: listing.address.state,
      postalCode: listing.address.postalCode,
    },
    adminAddress: null,
    shareHref: listingShareHref(listing.mlsId),
    interest: detailsPanelProps.isClosed
      ? null
      : { mlsId: listing.mlsId, address: street, city },
    map: {
      latitude: listing.latitude,
      longitude: listing.longitude,
      hidePin: false,
      outlineTown: null,
      defaultZoom: 15,
      addressQuery: street,
      postalCode: listing.address.postalCode,
    },
  };
  const router = useRouter();
  const stickyRef = useRef<HTMLDivElement | null>(null);
  const [activeDeckCard, setActiveDeckCard] =
    useState<ListingDesktopDeckCardId | null>("remarks");
  /** Deck card that was open before Map — restored when the page-width map is shown. */
  const priorDeckCardRef = useRef<ListingDesktopDeckCardId | null>("remarks");
  const remarksExpand = useListingRemarksExpand();
  const isDesktop = useIsDesktop();
  const siteUnlocked = useSiteUnlocked();
  const adminContact = extractListingAgentContact(listing.raw);
  const agentRows: { label: string; value: string }[] = (
    [
      { label: "List agent", value: adminContact?.listAgentName },
      { label: "Phone", value: adminContact?.phone },
      { label: "Email", value: adminContact?.email },
      { label: "Agent MLS #", value: adminContact?.agentMlsId },
      { label: "List office", value: adminContact?.listOfficeName },
    ] satisfies { label: string; value: string | null | undefined }[]
  ).flatMap((row) => (row.value ? [{ label: row.label, value: row.value }] : []));
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
    !host.map.hidePin &&
    listing.latitude != null &&
    listing.longitude != null
      ? {
          key: listing.listingKey || listing.mlsId,
          address: host.street,
          city: host.city,
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

  const rememberDeckBeforeMap = (
    cur: ListingDesktopDeckCardId | null,
  ): ListingDesktopDeckCardId | null => {
    if (cur && cur !== "map") priorDeckCardRef.current = cur;
    return cur;
  };

  const restoreDeckAfterMap = () => {
    setActiveDeckCard((cur) => {
      rememberDeckBeforeMap(cur);
      if (cur !== "map") return cur;
      return priorDeckCardRef.current;
    });
  };

  /** Map tab / Map section: full-width panel map, then put the deck back. */
  const goToPageMap = () => {
    setActiveTab("map");
    restoreDeckAfterMap();
    scrollToShowcaseSection("map");
  };

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
      if (tab === "map") {
        goToPageMap();
        return;
      }
      if (tab === "history") {
        setActiveTab("history");
        setActiveDeckCard((cur) => (cur === "history" ? null : "history"));
        return;
      }
    }
    const section = showcaseSectionForTab(tab);
    if (section) {
      setActiveTab(tab);
      scrollToShowcaseSection(section);
      return;
    }
    if (host.routeBase === "spotlight") {
      return;
    }
    router.push(listingSectionHref(listing.mlsId, tab, host.street, host.city));
  };

  useEffect(() => {
    const tab = host.initialTab;
    if (tab && tab !== "overview" && tab !== "admin") {
      handleTabSelect(tab);
      return;
    }
    const hash = window.location.hash.replace(/^#/, "");
    if (!hash) return;
    const section = (
      Object.entries(SHOWCASE_SECTION_IDS) as [
        keyof typeof SHOWCASE_SECTION_IDS,
        string,
      ][]
    ).find(([, id]) => id === hash)?.[0];
    if (section) scrollToShowcaseSection(section);
    // Mount-only: deep links from /spotlight/photos etc.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Full-width Map at the bottom of the panel is the destination. Once it is
  // on screen, put the dashboard back to the card that was open before Map.
  useEffect(() => {
    if (!isDesktop) return;
    const el = document.getElementById(SHOWCASE_SECTION_IDS.map);
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        restoreDeckAfterMap();
      },
      { threshold: 0.3 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [isDesktop]);

  const listingMap = (heightClass: string) => (
    <div className={heightClass}>
      {host.map.hidePin ? (
        <ListingLocationMap
          latitude={host.map.latitude}
          longitude={host.map.longitude}
          addressQuery={host.map.addressQuery}
          hidePin
          hideLabel
          outlineTown={host.map.outlineTown}
          defaultZoom={host.map.defaultZoom}
          variant="hero"
          className="h-full"
        />
      ) : (
        <ShowcaseCompsMap
          mlsId={listing.mlsId}
          subject={subject}
          townHint={host.townHint ?? host.city}
          postalCode={host.map.postalCode}
          fetchUrl={host.compsFetchUrl}
          uagFetchUrl={host.uagFetchUrl}
          hideSubject={host.map.hidePin}
        />
      )}
    </div>
  );

  /** Deck cards overlap by their header strip, as on production Overview. */
  const deckCard = (
    child: React.ReactNode,
    cardId: ListingDesktopDeckCardId,
    fill = false,
  ) => (
    // `w-full` matters: without it the Details card sizes to its own content
    // and ends up a different width from Remarks and History.
    <div
      className={`relative w-full min-w-0 transition-[box-shadow] duration-300 ${
        fill ? "flex min-h-0 flex-1 flex-col" : "shrink-0"
      } ${
        activeDeckCard === cardId
          ? "z-30 shadow-[0_12px_28px_-16px_rgba(0,0,0,0.65)]"
          : "z-10"
      }`}
    >
      {child}
    </div>
  );

  return (
    <ListingDesktopDeckProvider
      activeCard={activeDeckCard}
      onActiveCardChange={(id) => {
        setActiveDeckCard((cur) => {
          if (id === "map") rememberDeckBeforeMap(cur);
          return id;
        });
      }}
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
              {host.hideStatusBadge ? null : (
                <span className="shrink-0">
                  <DealBoardStatusBadge
                    status={status}
                    size="sm"
                    surface="listing"
                  />
                </span>
              )}
            </div>

            {host.propertyTabs ? (
              <div className="mb-3">{host.propertyTabs}</div>
            ) : null}

            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between lg:gap-6">
              <div className="min-w-0 flex-1">
                <p className="mb-1.5 font-mono text-[10px] tracking-[0.2em] uppercase text-gold">
                  Property Details
                </p>
                <ListingHeader
                  parts="meta"
                  mlsId={listing.mlsId}
                  status={listing.status}
                  address={host.headerAddress}
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
                  shareHref={host.shareHref ?? listingShareHref(listing.mlsId)}
                  privacyMode={host.privacyMode}
                  adminAddress={host.adminAddress}
                  compact
                  {...listingHeaderScoreProps({
                    goldilocksScore,
                    goldilocksBreakdown,
                    insight,
                    title: host.headline,
                    subtitle: host.locationLine || host.city,
                    propertyType: listing.propertyType,
                  })}
                />
              </div>

              {/* Production places Insight beside Property Details on desktop. */}
              {insight || insightFacts ? (
                <aside
                  className="hidden min-w-0 lg:block lg:max-w-sm"
                  aria-label="Listing insight"
                >
                  <p className="mb-1 font-mono text-[10px] tracking-[0.2em] uppercase text-gold lg:text-center">
                    Insight
                  </p>
                  <ShowcaseInsightBody
                    insight={insight}
                    facts={insightFacts ?? null}
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
                addressHint={host.addressHint}
                townHint={host.townHint ?? host.city}
                routeBase={host.routeBase}
                isRental={isRental}
                embedded
                compact
                onTabSelect={handleTabSelect}
                mapVisible={activeTab === "map"}
                onMapToggle={goToPageMap}
                showAdminTab={siteUnlocked}
              adminVisible={activeDeckCard === "admin"}
              onAdminToggle={
                siteUnlocked && isDesktop
                  ? () =>
                      setActiveDeckCard((cur) =>
                        cur === "admin" ? null : "admin",
                      )
                  : null
              }
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
          production Overview grid. Remarks / Details / History / Map live in
          the dashboard there; below `lg` they stay as stacked sections, since
          the mobile layout is being reviewed separately.
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
                <ShowcaseInsightBody
                  insight={insight}
                  facts={insightFacts ?? null}
                />
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
                            imgClassName={listingPhotoObfuscationImgClass(
                              host.obfuscatePhoto(i),
                              "absolute inset-0 w-full h-full object-cover transition-opacity duration-300",
                              listingPhotoObfuscationSizeForThumb(i),
                            )}
                          />
                          {host.obfuscatePhoto(i) ? (
                            <ListingPhotoObfuscationOverlay />
                          ) : null}
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
                    townHint={host.townHint ?? host.city}
                    suppressPageChrome
                    fetchUrl={host.uagFetchUrl ?? undefined}
                  />
                ) : (
                  <ListingComparablesPageContent
                    mlsId={listing.mlsId}
                    townHint={host.townHint ?? host.city}
                    kind={txTab === "comparable-rentals" ? "rental" : "sale"}
                    suppressPageChrome
                    fetchUrl={
                      txTab === "comparable-rentals"
                        ? host.rentalCompsFetchUrl ?? undefined
                        : host.compsFetchUrl ?? undefined
                    }
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
                  addressHint={host.ifAddressHint}
                  townHint={host.townHint ?? host.city}
                  isRental={isRental}
                  routeBase={host.routeBase}
                  suppressPageChrome
                />
              </Section>

              <div className="lg:hidden">
                <Section id={SHOWCASE_SECTION_IDS.history} title="History">
                  <ListingHistoryPanel
                    mlsId={listing.mlsId}
                    townHint={host.townHint ?? host.city}
                    variant="page"
                  />
                </Section>
              </div>

              <Section id={SHOWCASE_SECTION_IDS.map} title="Map">
                {/* Full-width of the main panel, same slot it used to occupy
                under What if. The right-hand deck Map card is a peek only. */}
                {listingMap("h-[20rem] w-full sm:h-[26rem]")}
              </Section>

              {/*
                Public listing-agent attribution, served as a PNG so it reads
                normally but cannot be selected or copied. Rendering it
                server-side also means these fields can later be dropped from
                the listing API without changing anything here.
              */}
              {agentRows.length > 0 ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={`/api/listings/${encodeURIComponent(listing.mlsId)}/agent-card`}
                  alt={`Listing courtesy of ${adminContact?.listOfficeName ?? "the listing office"}`}
                  width={1120}
                  height={52}
                  className="mt-6 h-auto w-full max-w-[560px] select-none"
                  draggable={false}
                />
              ) : null}
            </div>

            <aside
              className="hidden min-w-0 lg:col-start-2 lg:block lg:self-stretch"
              aria-label="Listing dashboard"
            >
              {/* Capped to the space under the pinned chrome so a tall expanded
              card scrolls on the wheel instead of running off-screen. */}
          <div className="showcase-hide-scrollbar sticky flex h-[calc(100dvh-var(--showcase-sticky-offset,12rem)-1.5rem)] flex-col gap-4 overflow-y-auto overscroll-contain lg:top-[var(--showcase-sticky-offset,12rem)]">
                {/* Anchors the column width above the deck, as on production. */}
                {host.interest ? (
                  <ListingInterestButton
                    mlsId={host.interest.mlsId}
                    address={host.interest.address}
                    city={host.interest.city}
                  />
                ) : null}
                <div className="flex min-h-0 min-w-0 flex-1 flex-col">
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
                        townHint={host.townHint ?? host.city}
                        frameClass={listingPanelCompactClass}
                      />,
                      "history",
                    )}
                  </div>
                  <div className="-mt-2 flex min-h-0 flex-1 flex-col">
                    {deckCard(
                      <ListingMapSidePanel frameClass={listingPanelCompactClass}>
                        {listingMap("h-full min-h-0 w-full")}
                      </ListingMapSidePanel>,
                      "map",
                      true,
                    )}
                  </div>
                  {siteUnlocked ? (
                    <div className="-mt-2">
                      {deckCard(
                        <ListingAdminAgentPanel
                          contact={adminContact}
                          vision={vision}
                          mlsId={listing.mlsId}
                          deckMode
                        />,
                        "admin",
                      )}
                    </div>
                  ) : null}
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
