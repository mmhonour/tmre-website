import MostViewedCard from "@/components/MostViewedCard";
import type { ContentViewSummary } from "@/lib/content-views";
import type { ContentViewTotals } from "@/lib/db/content-views-repo";

function formatSince(iso: string | null): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
  }).format(date);
}

export default function AdminTrafficPanel({
  properties,
  pages,
  totals,
}: {
  properties: ContentViewSummary[];
  pages: ContentViewSummary[];
  totals: ContentViewTotals;
}) {
  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-charcoal/[0.08] bg-white px-5 sm:px-6 py-5 shadow-sm shadow-charcoal/[0.04]">
        <p className="font-mono text-[11px] tracking-[0.2em] uppercase text-gold">
          Running totals
        </p>
        <div className="mt-3 grid grid-cols-2 gap-4 lg:grid-cols-4">
          <div>
            <p className="font-serif text-2xl text-navy tabular-nums">
              {totals.propertyViews.toLocaleString()}
            </p>
            <p className="font-mono text-[10px] tracking-[0.14em] uppercase text-charcoal/45">
              Property views
            </p>
          </div>
          <div>
            <p className="font-serif text-2xl text-navy tabular-nums">
              {totals.properties.toLocaleString()}
            </p>
            <p className="font-mono text-[10px] tracking-[0.14em] uppercase text-charcoal/45">
              Properties viewed
            </p>
          </div>
          <div>
            <p className="font-serif text-2xl text-navy tabular-nums">
              {totals.pageViews.toLocaleString()}
            </p>
            <p className="font-mono text-[10px] tracking-[0.14em] uppercase text-charcoal/45">
              Page views
            </p>
          </div>
          <div>
            <p className="font-serif text-2xl text-navy tabular-nums">
              {totals.pages.toLocaleString()}
            </p>
            <p className="font-mono text-[10px] tracking-[0.14em] uppercase text-charcoal/45">
              Pages viewed
            </p>
          </div>
        </div>
        <p className="mt-4 max-w-3xl text-xs leading-snug text-charcoal/55">
          Counted since {formatSince(totals.since)}. Every visit counts,
          including your own. Property sub-tabs (photos, comps, history, what
          if) roll up to the property, and a Spotlight view counts toward the
          property that slot featured at the time.
        </p>
      </div>

      <MostViewedCard
        id="admin-top-properties"
        title="Most viewed properties"
        note="Highest running view count first, with distinct visitors alongside."
        rows={properties}
        emptyMessage="No property views counted yet — the counter starts with the next visit."
      />

      <MostViewedCard
        id="admin-top-pages"
        title="Most viewed pages"
        note="Everything that is not a property page, including Spotlight slots with no MLS id attached."
        rows={pages}
        emptyMessage="No page views counted yet."
      />
    </div>
  );
}
