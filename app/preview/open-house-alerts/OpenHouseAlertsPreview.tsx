"use client";

import LatestSearchAlertForm from "@/components/latest/LatestSearchAlertForm";
import { normalizeVisitorSearchCriteria } from "@/lib/visitor-search-profile";

const FALLBACK = normalizeVisitorSearchCriteria({
  source: "intelligence",
  town: "Westport",
  tx: "sale",
  propertyClass: "residential",
  saleProperty: "homes",
  minBeds: null,
  maxBeds: null,
  minBaths: null,
  maxBaths: null,
  zip: null,
  newConstruction: null,
  boardStatus: null,
  minPrice: 800_000,
  maxPrice: 2_000_000,
});

export function OpenHouseAlertsPreview() {
  return (
    <div className="space-y-8">
      <section className="rounded-2xl border border-charcoal/[0.08] bg-white px-4 py-4">
        <h2 className="mb-1 font-mono text-[11px] uppercase tracking-[0.14em] text-slate">
          Open Houses page
        </h2>
        <p className="mb-3 text-xs text-slate">
          Trigger says Open house alerts. Notify for defaults to open houses;
          new listings is optional.
        </p>
        <LatestSearchAlertForm
          variant="open-houses"
          fallbackCriteria={FALLBACK}
          triggerId="preview-oh-alerts"
        />
      </section>

      <section className="rounded-2xl border border-charcoal/[0.08] bg-white px-4 py-4">
        <h2 className="mb-1 font-mono text-[11px] uppercase tracking-[0.14em] text-slate">
          Latest page
        </h2>
        <p className="mb-3 text-xs text-slate">
          Trigger stays Listing alerts. Notify for defaults to new listings;
          open houses is optional for when a showing is detected later.
        </p>
        <LatestSearchAlertForm
          variant="latest"
          fallbackCriteria={FALLBACK}
          triggerId="preview-latest-alerts"
        />
      </section>
    </div>
  );
}
