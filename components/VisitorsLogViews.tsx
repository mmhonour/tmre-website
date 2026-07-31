"use client";

import { useState } from "react";
import VisitorsByPropertyLog from "@/components/VisitorsByPropertyLog";
import VisitorsGroupedLog from "@/components/VisitorsGroupedLog";
import type { VisitorPropertyGroup } from "@/lib/visitors-property-groups";
import type { VisitorProviderGroup } from "@/lib/visitors-types";

type ViewId = "provider" | "property";

export default function VisitorsLogViews({
  providerGroups,
  propertyGroups,
  propertyLabels,
}: {
  providerGroups: VisitorProviderGroup[];
  propertyGroups: VisitorPropertyGroup[];
  propertyLabels: Record<string, string>;
}) {
  const [view, setView] = useState<ViewId>("provider");

  return (
    <div className="overflow-hidden rounded-2xl border border-charcoal/[0.08] bg-white shadow-sm shadow-charcoal/[0.04]">
      <div className="border-b border-charcoal/[0.08] bg-cream/40 px-5 py-4 sm:px-6">
        <div
          role="tablist"
          aria-label="Visitor log grouping"
          className="flex flex-wrap gap-1"
        >
          {(
            [
              {
                id: "provider" as const,
                label: "By provider → location",
                hint: "ISP / network, then place",
              },
              {
                id: "property" as const,
                label: "By property → date",
                hint: "Most-hit properties from this log, then day",
              },
            ] as const
          ).map((tab) => {
            const active = view === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setView(tab.id)}
                className={`rounded-full border px-3 py-1.5 font-mono text-[10px] tracking-[0.12em] uppercase transition-colors ${
                  active
                    ? "border-navy/30 bg-navy text-white"
                    : "border-charcoal/15 bg-white text-charcoal/55 hover:border-navy/25 hover:text-navy"
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
        <p className="mt-2 text-sm text-slate">
          {view === "provider"
            ? "Providers and locations sorted by pageviews (desc). + / − drills in."
            : "Properties ranked by hits retained in this log (same source as rows below). Days are Eastern. + / − drills in."}
        </p>
      </div>

      {view === "provider" ? (
        <VisitorsGroupedLog
          groups={providerGroups}
          properties={propertyLabels}
        />
      ) : (
        <VisitorsByPropertyLog groups={propertyGroups} />
      )}
    </div>
  );
}
