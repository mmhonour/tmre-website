"use client";

import { useState } from "react";
import VisitorIdentityCell from "@/components/VisitorIdentityCell";
import {
  contentViewPageLabel,
  resolveViewedContent,
} from "@/lib/content-views";
import {
  type VisitorRecord,
  type VisitorZipGroup,
} from "@/lib/visitors-types";

type PropertyLabels = Record<string, string>;

function formatTimestamp(iso: string | null | undefined): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function pathLabel(path: string, properties: PropertyLabels): string {
  const content = resolveViewedContent(path);
  if (content.kind === "listing" && content.mlsId) {
    const base = properties[content.mlsId] ?? `MLS ${content.mlsId}`;
    return content.section ? `${base} (${content.section})` : base;
  }
  return contentViewPageLabel(content.path);
}

function recentPaths(
  visitor: VisitorRecord,
  properties: PropertyLabels,
  limit = 4,
): string {
  const labels = [...visitor.pages]
    .reverse()
    .map((p) => pathLabel(p.path, properties))
    .filter(Boolean);
  const unique: string[] = [];
  for (const label of labels) {
    if (!unique.includes(label)) unique.push(label);
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

function VisitorRow({
  visitor,
  properties,
}: {
  visitor: VisitorRecord;
  properties: PropertyLabels;
}) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-[minmax(12rem,1.1fr)_minmax(0,1.4fr)_auto] gap-2 lg:gap-6 lg:items-start pl-2 sm:pl-4">
      <VisitorIdentityCell visitor={visitor} />
      <div className="min-w-0">
        <p className="font-mono text-[10px] tracking-[0.14em] uppercase text-charcoal/40 mb-1">
          Recent pages
        </p>
        <p className="text-sm text-slate break-words">
          {recentPaths(visitor, properties)}
        </p>
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

export default function VisitorsZipLog({
  groups,
  properties = {},
}: {
  groups: VisitorZipGroup[];
  properties?: PropertyLabels;
}) {
  const [openZips, setOpenZips] = useState<Set<string>>(() => new Set());

  function toggleZip(zip: string) {
    setOpenZips((prev) => {
      const next = new Set(prev);
      if (next.has(zip)) next.delete(zip);
      else next.add(zip);
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
        const open = openZips.has(group.zip);
        return (
          <li key={group.zip} className="px-5 sm:px-6 py-3">
            <div className="flex items-start gap-3">
              <DrillToggle
                expanded={open}
                onToggle={() => toggleZip(group.zip)}
                label={group.location}
              />
              <div className="min-w-0 flex-1">
                <button
                  type="button"
                  onClick={() => toggleZip(group.zip)}
                  className="w-full text-left"
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                    <p className="font-mono text-[12px] tracking-[0.1em] uppercase text-navy font-medium">
                      {group.zip}
                    </p>
                    <p className="font-mono text-[11px] tabular-nums text-charcoal/50">
                      {group.visitorCount.toLocaleString()} visitors ·{" "}
                      {group.pageviews.toLocaleString()} views
                    </p>
                  </div>
                  <p className="mt-0.5 text-sm text-slate">{group.location}</p>
                  <p className="mt-0.5 font-mono text-[10px] text-charcoal/40">
                    last {formatTimestamp(group.lastSeen)}
                  </p>
                </button>

                {open ? (
                  <ul className="mt-3 ml-1 border-l border-charcoal/[0.08] pl-3 sm:pl-4 divide-y divide-charcoal/[0.06]">
                    {group.visitors.map((visitor) => (
                      <li key={visitor.vid} className="py-3">
                        <VisitorRow visitor={visitor} properties={properties} />
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
  );
}
