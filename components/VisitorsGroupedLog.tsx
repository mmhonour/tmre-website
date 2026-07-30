"use client";

import { useState } from "react";
import {
  formatVisitorIdentity,
  type VisitorProviderGroup,
  type VisitorRecord,
} from "@/lib/visitors-types";

function formatTimestamp(iso: string | null | undefined): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function recentPaths(visitor: VisitorRecord, limit = 4): string {
  const paths = [...visitor.pages]
    .reverse()
    .map((p) => p.path)
    .filter(Boolean);
  const unique: string[] = [];
  for (const path of paths) {
    if (!unique.includes(path)) unique.push(path);
    if (unique.length >= limit) break;
  }
  return unique.join(" → ") || "—";
}

function DrillToggle({
  expanded,
  onToggle,
  label,
}: {
  expanded: boolean;
  onToggle: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={expanded}
      aria-label={expanded ? `Collapse ${label}` : `Expand ${label}`}
      className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded border border-charcoal/15 bg-cream/50 font-mono text-sm leading-none text-navy hover:border-gold/50 hover:bg-gold/10 transition-colors"
    >
      {expanded ? "−" : "+"}
    </button>
  );
}

function VisitorRow({ visitor }: { visitor: VisitorRecord }) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-[minmax(12rem,1.1fr)_minmax(0,1.4fr)_auto] gap-2 lg:gap-6 lg:items-start pl-2 sm:pl-4">
      <div className="min-w-0">
        <p className="font-mono text-[11px] tracking-[0.12em] uppercase text-navy">
          {formatVisitorIdentity(visitor)}
        </p>
        {visitor.audienceType ? (
          <p className="mt-1 font-mono text-[10px] tracking-[0.14em] uppercase text-gold">
            {visitor.audienceType}
          </p>
        ) : null}
      </div>

      <div className="min-w-0">
        <p className="font-mono text-[10px] tracking-[0.14em] uppercase text-charcoal/40 mb-1">
          Recent pages
        </p>
        <p className="text-sm text-slate break-words">{recentPaths(visitor)}</p>
        <p className="mt-2 font-mono text-[10px] text-charcoal/35 truncate">
          {visitor.vid}
          {visitor.ip ? ` · ${visitor.ip}` : ""}
        </p>
      </div>

      <div className="lg:text-right font-mono text-[11px] tabular-nums text-charcoal/55 space-y-1 shrink-0">
        <p>
          <span className="text-navy font-semibold">
            {visitor.pageviews.toLocaleString()}
          </span>{" "}
          views
        </p>
        <p>Last {formatTimestamp(visitor.lastSeen)}</p>
        <p className="text-charcoal/35">
          First {formatTimestamp(visitor.firstSeen)}
        </p>
      </div>
    </div>
  );
}

export default function VisitorsGroupedLog({
  groups,
}: {
  groups: VisitorProviderGroup[];
}) {
  const [openProviders, setOpenProviders] = useState<Set<string>>(() => new Set());
  const [openLocations, setOpenLocations] = useState<Set<string>>(() => new Set());

  function toggleProvider(provider: string) {
    setOpenProviders((prev) => {
      const next = new Set(prev);
      if (next.has(provider)) next.delete(provider);
      else next.add(provider);
      return next;
    });
  }

  function toggleLocation(provider: string, location: string) {
    const key = `${provider}\0${location}`;
    setOpenLocations((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  if (groups.length === 0) {
    return (
      <div className="px-5 sm:px-6 py-10">
        <p className="text-sm text-slate">No visitors logged yet.</p>
      </div>
    );
  }

  return (
    <ul className="divide-y divide-charcoal/[0.08]">
      {groups.map((group) => {
        const providerOpen = openProviders.has(group.provider);
        return (
          <li key={group.provider} className="px-5 sm:px-6 py-3">
            <div className="flex items-start gap-3">
              <DrillToggle
                expanded={providerOpen}
                onToggle={() => toggleProvider(group.provider)}
                label={group.provider}
              />
              <div className="min-w-0 flex-1">
                <button
                  type="button"
                  onClick={() => toggleProvider(group.provider)}
                  className="w-full text-left"
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                    <p className="font-mono text-[12px] tracking-[0.1em] uppercase text-navy font-medium">
                      {group.provider}
                    </p>
                    <p className="font-mono text-[11px] tabular-nums text-charcoal/50">
                      {group.visitorCount.toLocaleString()} visitors ·{" "}
                      {group.pageviews.toLocaleString()} views
                    </p>
                  </div>
                  <p className="mt-0.5 font-mono text-[10px] text-charcoal/40">
                    {group.locations.length.toLocaleString()} location
                    {group.locations.length === 1 ? "" : "s"} · last{" "}
                    {formatTimestamp(group.lastSeen)}
                  </p>
                </button>

                {providerOpen ? (
                  <ul className="mt-3 ml-1 border-l border-charcoal/[0.08] pl-3 sm:pl-4 space-y-2">
                    {group.locations.map((loc) => {
                      const locKey = `${group.provider}\0${loc.location}`;
                      const locOpen = openLocations.has(locKey);
                      return (
                        <li key={loc.location} className="py-1">
                          <div className="flex items-start gap-3">
                            <DrillToggle
                              expanded={locOpen}
                              onToggle={() =>
                                toggleLocation(group.provider, loc.location)
                              }
                              label={loc.location}
                            />
                            <div className="min-w-0 flex-1">
                              <button
                                type="button"
                                onClick={() =>
                                  toggleLocation(group.provider, loc.location)
                                }
                                className="w-full text-left"
                              >
                                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                                  <p className="text-sm text-slate font-medium">
                                    {loc.location}
                                  </p>
                                  <p className="font-mono text-[11px] tabular-nums text-charcoal/50">
                                    {loc.visitorCount.toLocaleString()} ·{" "}
                                    {loc.pageviews.toLocaleString()} views
                                  </p>
                                </div>
                              </button>

                              {locOpen ? (
                                <ul className="mt-2 ml-1 border-l border-charcoal/[0.06] pl-3 sm:pl-4 divide-y divide-charcoal/[0.06]">
                                  {loc.visitors.map((visitor) => (
                                    <li key={visitor.vid} className="py-3">
                                      <VisitorRow visitor={visitor} />
                                    </li>
                                  ))}
                                </ul>
                              ) : null}
                            </div>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                ) : null}
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
