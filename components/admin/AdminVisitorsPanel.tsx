import VisitorsLogViews from "@/components/VisitorsLogViews";
import type { VisitorPropertyGroup } from "@/lib/visitors-property-groups";
import type { VisitorProviderGroup } from "@/lib/visitors-types";

export default function AdminVisitorsPanel({
  providerGroups,
  propertyGroups,
  propertyLabels,
  stats,
}: {
  providerGroups: VisitorProviderGroup[];
  propertyGroups: VisitorPropertyGroup[];
  propertyLabels: Record<string, string>;
  stats: {
    visitors: number;
    providers: number;
    propertiesInLog: number;
    identified: number;
    withPhone: number;
    pageviews: number;
  };
}) {
  return (
    <div id="admin-visitors-log" className="scroll-mt-24 space-y-6">
      <div className="rounded-2xl border border-charcoal/[0.08] bg-white px-5 py-5 shadow-sm shadow-charcoal/[0.04] sm:px-6">
        <p className="font-mono text-[11px] tracking-[0.2em] uppercase text-gold">
          Visitors log
        </p>
        <p className="mt-2 max-w-3xl text-sm text-slate">
          Activity from the{" "}
          <span className="font-mono text-xs">visitors</span> table — provider →
          location, or property → date. Most-viewed running totals live under{" "}
          <span className="font-mono text-xs">Traffic</span> (
          <span className="font-mono text-xs">content_views</span>).
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 font-mono text-[11px] text-charcoal/50">
          <span>{stats.visitors.toLocaleString()} visitors</span>
          <span>{stats.providers.toLocaleString()} providers</span>
          <span>
            {stats.propertiesInLog.toLocaleString()} properties in log
          </span>
          <span>{stats.identified.toLocaleString()} identified</span>
          <span>{stats.withPhone.toLocaleString()} with phone</span>
          <span>{stats.pageviews.toLocaleString()} pageviews</span>
        </div>
      </div>

      <VisitorsLogViews
        providerGroups={providerGroups}
        propertyGroups={propertyGroups}
        propertyLabels={propertyLabels}
      />
    </div>
  );
}
