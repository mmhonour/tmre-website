"use client";

import AdminVisitorsPanel from "@/components/admin/AdminVisitorsPanel";
import type { VisitorRecord } from "@/lib/visitors-types";

export default function AdminVisitorsZipPreviewClient({
  visitors,
  propertyLabels,
  stats,
}: {
  visitors: VisitorRecord[];
  propertyLabels: Record<string, string>;
  stats: {
    visitors: number;
    strangers: number;
    admin: number;
    identified: number;
    withPhone: number;
    pageviews: number;
  };
}) {
  return (
    <div className="min-h-screen bg-cream">
      <div className="mx-auto max-w-5xl px-4 pb-16 pt-24 sm:px-6">
        <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.2em] text-gold">
          UI preview
        </p>
        <h1 className="mb-2 font-serif text-3xl text-navy">
          Admin visitors — ZIP + you
        </h1>
        <p className="mb-8 text-sm leading-relaxed text-slate">
          Fixture traffic. By ZIP is the default grouping. You · Admin is the
          site-password cookie. Hide my admin visits drops those rows so
          strangers stay visible.
        </p>
        <AdminVisitorsPanel
          visitors={visitors}
          propertyLabels={propertyLabels}
          topProperties={[]}
          topPages={[]}
          stats={stats}
          defaultOpenZips={["06880"]}
        />
      </div>
    </div>
  );
}
