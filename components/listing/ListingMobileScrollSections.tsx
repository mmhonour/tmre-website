"use client";

import dynamic from "next/dynamic";
import { useEffect } from "react";
import ListingHistoryPanel from "@/components/ListingHistoryPanel";
import { LISTING_SECTION_IDS } from "@/components/listing/listing-section-ids";

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
};

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
    <section
      id={id}
      className="scroll-mt-[var(--listing-sticky-offset,6rem)] border-t border-slate-200 pt-5 mt-6"
    >
      <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500 mb-3">
        {title}
      </h2>
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
 * Continuous listing / Spotlight body under Overview: History → What if →
 * Sold → Rented → UAG. Tab clicks jump to in-page anchors (no route remount).
 * Photos stays its own route (different chrome).
 */
export function ListingMobileScrollSections({
  mlsId,
  addressHint,
  townHint,
  routeBase = "listing",
  propertyParam = null,
}: Props) {
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

  // Deep-link / tab jump: scroll once the target section exists (lazy panels).
  useEffect(() => {
    if (scrollToHashTarget()) return;
    const started = Date.now();
    const id = window.setInterval(() => {
      if (scrollToHashTarget() || Date.now() - started > 6000) {
        window.clearInterval(id);
      }
    }, 120);
    return () => window.clearInterval(id);
  }, [mlsId]);

  return (
    <div className="mt-8 space-y-0">
      <Section id={LISTING_SECTION_IDS.history} title="History">
        <ListingHistoryPanel
          mlsId={mlsId}
          townHint={townHint}
          variant="page"
        />
      </Section>
      <Section id={LISTING_SECTION_IDS.if} title="What if">
        <ListingIfPageContent
          mlsId={mlsId}
          addressHint={addressHint}
          townHint={townHint}
          routeBase={routeBase}
        />
      </Section>
      <Section id={LISTING_SECTION_IDS.comparables} title="Sold">
        <ListingComparablesPageContent
          mlsId={mlsId}
          townHint={townHint}
          kind="sale"
          fetchUrl={salesFetchUrl}
        />
      </Section>
      <Section id={LISTING_SECTION_IDS["comparable-rentals"]} title="Rented">
        <ListingComparablesPageContent
          mlsId={mlsId}
          townHint={townHint}
          kind="rental"
          fetchUrl={rentalsFetchUrl}
        />
      </Section>
      <Section id={LISTING_SECTION_IDS.uag} title="Under agreement">
        <ListingUagPageContent
          mlsId={mlsId}
          townHint={townHint}
          fetchUrl={uagFetchUrl}
        />
      </Section>
    </div>
  );
}
