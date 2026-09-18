import MostViewedCard from "@/components/MostViewedCard";
import VisitorsLogViews from "@/components/VisitorsLogViews";
import type { ContentViewSummaryWithAudience } from "@/lib/content-view-audience";
import type { ContentViewSummary } from "@/lib/content-views";
import type { VisitorRecord } from "@/lib/visitors-types";

export default function AdminVisitorsPanel({
  visitors,
  propertyLabels,
  topProperties,
  topPages,
  stats,
  defaultOpenZips,
}: {
  visitors: VisitorRecord[];
  propertyLabels: Record<string, string>;
  topProperties: ContentViewSummaryWithAudience[];
  topPages: ContentViewSummary[];
  stats: {
    visitors: number;
    strangers: number;
    admin: number;
    identified: number;
    withPhone: number;
    pageviews: number;
  };
  defaultOpenZips?: string[];
}) {
  return (
    <div id="admin-visitors-log" className="scroll-mt-24 space-y-6">
      <div className="grid gap-4 lg:grid-cols-2">
        <MostViewedCard
          id="admin-top-properties"
          title="Most viewed properties"
          note="Running count from content_views. + / − opens who viewed it, grouped by provider → location (views desc). You · Admin marks site-password hits."
          rows={topProperties}
          emptyMessage="No property views counted yet — run the content_views backfill or wait for the next visit."
        />
        <MostViewedCard
          id="admin-top-pages"
          title="Most viewed pages"
          note="Running count of everything that is not a property page."
          rows={topPages}
          emptyMessage="No page views counted yet."
        />
      </div>

      <div className="rounded-2xl border border-charcoal/[0.08] bg-white px-5 py-5 shadow-sm shadow-charcoal/[0.04] sm:px-6">
        <p className="font-mono text-[11px] tracking-[0.2em] uppercase text-gold">
          Visitors log
        </p>
        <p className="mt-2 max-w-3xl text-sm text-slate">
          ZIP on each visit is the header pill when the visitor set one,
          otherwise the IP lookup.{" "}
          <span className="font-medium text-navy">You · Admin</span> is the
          site-password cookie, not a stranger. Use Hide my admin visits on the
          log below.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 font-mono text-[11px] text-charcoal/50">
          <span>{stats.visitors.toLocaleString()} visitors</span>
          <span>{stats.strangers.toLocaleString()} strangers</span>
          <span>{stats.admin.toLocaleString()} admin</span>
          <span>{stats.identified.toLocaleString()} identified</span>
          <span>{stats.withPhone.toLocaleString()} with phone</span>
          <span>{stats.pageviews.toLocaleString()} pageviews</span>
        </div>
      </div>

      <VisitorsLogViews
        visitors={visitors}
        propertyLabels={propertyLabels}
        adminCount={stats.admin}
        defaultOpenZips={defaultOpenZips}
      />
    </div>
  );
}
