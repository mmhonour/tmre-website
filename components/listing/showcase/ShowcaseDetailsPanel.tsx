"use client";

import { useRouter } from "next/navigation";
import { DealBoardStatusBadge } from "@/components/intelligence/deal-board/deal-board-shared";
import ListingHistoryPanel from "@/components/ListingHistoryPanel";
import { ListingComparablesPageContent } from "@/components/listing/ListingComparablesPanel";
import ListingHeader from "@/components/listing/ListingHeader";
import { ListingIfPageContent } from "@/components/listing/ListingIfPanel";
import { ListingInsightCopy } from "@/components/listing/ListingInsightCopy";
import { ListingBackLink } from "@/components/listing/ListingShell";
import ShowcaseCompsMap from "@/components/listing/showcase/ShowcaseCompsMap";
import ListingSubnav, { type ListingTab } from "@/components/listing/ListingSubnav";
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
import { formatMlsStatus, primaryListingPrice, primaryListingPriceIsClosed } from "@/lib/listing-history";
import { listingHeaderScoreProps } from "@/lib/listing-header-score-props";
import { listingSectionHref, listingShareHref } from "@/lib/listing-url";

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
  children,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-24 border-t border-white/10 pt-8">
      <SectionHeading>{title}</SectionHeading>
      <div className="mt-5">{children}</div>
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
  goldilocksScore,
  goldilocksBreakdown,
}: {
  listing: ShowcaseListing;
  street: string;
  city: string;
  addressHint?: string | null;
  insight: string | null;
  remarks: string;
  detailRows: ShowcaseDetailRow[];
  isRental: boolean;
  goldilocksScore?: number | null;
  goldilocksBreakdown?: Parameters<typeof listingHeaderScoreProps>[0]["goldilocksBreakdown"];
}) {
  const router = useRouter();
  const status = formatMlsStatus(listing.status);
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
    const section = showcaseSectionForTab(tab);
    if (section) {
      scrollToShowcaseSection(section);
      return;
    }
    router.push(listingSectionHref(listing.mlsId, tab, street, city));
  };

  return (
    <section className="navy-gradient relative border-t border-white/10 px-4 py-12 sm:px-8 lg:px-12 lg:py-16">
      <div className="absolute inset-0 hero-grid opacity-20" aria-hidden />
      <div className="relative mx-auto w-full max-w-7xl">
        <div className="mb-2 flex items-start justify-between gap-3">
          <ListingBackLink className="mb-0" />
          <span className="shrink-0">
            <DealBoardStatusBadge status={status} size="sm" surface="listing" />
          </span>
        </div>

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

        <div className="mt-3">
          <ListingSubnav
            mlsId={listing.mlsId}
            active="overview"
            addressHint={street || addressHint}
            townHint={city}
            isRental={isRental}
            compact
            onTabSelect={handleTabSelect}
            onMapToggle={() => scrollToShowcaseSection("map")}
          />
        </div>

        <div className="mt-8 flex flex-col gap-8">
          <section id={SHOWCASE_SECTION_IDS.overview} className="scroll-mt-24">
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
              <p className="text-sm text-white/50">No insight for this listing.</p>
            )}
          </Section>

          <Section id={SHOWCASE_SECTION_IDS.details} title="Details">
            <dl className="divide-y divide-white/10 border-y border-white/10 lg:max-w-xl">
              {detailRows.map((row) => (
                <div
                  key={row.label}
                  className="flex items-baseline justify-between gap-6 py-3"
                >
                  <dt className="font-mono text-[10px] uppercase tracking-[0.2em] text-white/45">
                    {row.label}
                  </dt>
                  <dd className="text-right text-sm text-white/90">{row.value}</dd>
                </div>
              ))}
            </dl>
          </Section>

          <Section
            id={SHOWCASE_SECTION_IDS.comps}
            title={isRental ? "Rented comparables" : "Sold comparables"}
          >
            {/* Same body the Overview slide panel and the dedicated
                /comparables route render — one component, three hosts. */}
            <ListingComparablesPageContent
              mlsId={listing.mlsId}
              townHint={city}
              kind={isRental ? "rental" : "sale"}
              suppressPageChrome
            />
          </Section>

          <Section id={SHOWCASE_SECTION_IDS.if} title="What if">
            <ListingIfPageContent
              mlsId={listing.mlsId}
              addressHint={street || addressHint}
              townHint={city}
              isRental={isRental}
              suppressPageChrome
            />
          </Section>

          <Section id={SHOWCASE_SECTION_IDS.history} title="History">
            <ListingHistoryPanel
              mlsId={listing.mlsId}
              townHint={city}
              variant="page"
            />
          </Section>

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
              />
            </div>
          </Section>
        </div>
      </div>
    </section>
  );
}
