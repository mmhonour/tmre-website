"use client";

import { useMemo, useState } from "react";
import VisitorsByPropertyLog from "@/components/VisitorsByPropertyLog";
import VisitorsGroupedLog from "@/components/VisitorsGroupedLog";
import VisitorsZipLog from "@/components/VisitorsZipLog";
import { groupVisitorsByPropertyThenDate } from "@/lib/visitors-property-groups";
import {
  groupVisitorsByProviderThenLocation,
  groupVisitorsByZip,
  visitorIsAdmin,
  type VisitorRecord,
} from "@/lib/visitors-types";

type ViewId = "zip" | "provider" | "property";

export default function VisitorsLogViews({
  visitors,
  propertyLabels,
  adminCount,
}: {
  visitors: VisitorRecord[];
  propertyLabels: Record<string, string>;
  adminCount: number;
}) {
  const [view, setView] = useState<ViewId>("zip");
  const [hideAdmin, setHideAdmin] = useState(false);

  const visible = useMemo(
    () => (hideAdmin ? visitors.filter((v) => !visitorIsAdmin(v)) : visitors),
    [hideAdmin, visitors],
  );
  const providerGroups = useMemo(
    () => groupVisitorsByProviderThenLocation(visible),
    [visible],
  );
  const zipGroups = useMemo(() => groupVisitorsByZip(visible), [visible]);
  const propertyGroups = useMemo(
    () => groupVisitorsByPropertyThenDate(visible, propertyLabels),
    [visible, propertyLabels],
  );

  return (
    <div className="overflow-hidden rounded-2xl border border-charcoal/[0.08] bg-white shadow-sm shadow-charcoal/[0.04]">
      <div className="border-b border-charcoal/[0.08] bg-cream/40 px-5 py-4 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div
            role="tablist"
            aria-label="Visitor log grouping"
            className="flex flex-wrap gap-1"
          >
            {(
              [
                {
                  id: "zip" as const,
                  label: "By ZIP",
                  hint: "Where people are coming from",
                },
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
          {adminCount > 0 ? (
            <label className="inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.12em] text-charcoal/55">
              <input
                type="checkbox"
                checked={hideAdmin}
                onChange={(e) => setHideAdmin(e.target.checked)}
                className="h-3.5 w-3.5 accent-navy"
              />
              Hide my admin visits
            </label>
          ) : null}
        </div>
        <p className="mt-2 text-sm text-slate">
          {view === "zip"
            ? "ZIP from the header pill or IP lookup. + / − drills in."
            : view === "provider"
              ? "Providers and locations sorted by pageviews (desc). + / − drills in."
              : "Properties ranked by hits retained in this log (same source as rows below). Days are Eastern. + / − drills in."}
        </p>
      </div>

      {view === "zip" ? (
        <VisitorsZipLog groups={zipGroups} properties={propertyLabels} />
      ) : view === "provider" ? (
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
