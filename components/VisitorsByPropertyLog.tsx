"use client";

import { useState } from "react";
import type { VisitorPropertyGroup } from "@/lib/visitors-property-groups";
import {
  formatVisitorIdentity,
  visitorIdentitySourceLabel,
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

function DayVisitorRow({
  visitor,
  hits,
  lastAt,
}: {
  visitor: VisitorRecord;
  hits: number;
  lastAt: string;
}) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-[minmax(12rem,1.1fr)_minmax(0,1fr)_auto] gap-2 lg:gap-6 lg:items-start pl-2 sm:pl-4">
      <div className="min-w-0">
        <p className="font-mono text-[11px] tracking-[0.12em] uppercase text-navy">
          {formatVisitorIdentity(visitor)}
        </p>
        {visitor.phone ? (
          <p className="mt-1 font-mono text-[11px] tabular-nums text-navy/70">
            {visitor.phone}
          </p>
        ) : null}
        {visitor.identitySources && visitor.identitySources.length > 0 ? (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {visitor.identitySources.map((source) => (
              <span
                key={source}
                className="inline-flex rounded-full border border-charcoal/15 bg-cream/60 px-1.5 py-0.5 font-mono text-[9px] tracking-[0.12em] uppercase text-charcoal/55"
              >
                {visitorIdentitySourceLabel(source)}
              </span>
            ))}
          </div>
        ) : null}
      </div>

      <div className="min-w-0">
        <p className="font-mono text-[10px] text-charcoal/35 truncate">
          {visitor.vid}
          {visitor.ip ? ` · ${visitor.ip}` : ""}
        </p>
      </div>

      <div className="lg:text-right font-mono text-[11px] tabular-nums text-charcoal/55 space-y-1 shrink-0">
        <p>
          <span className="text-navy font-semibold">{hits.toLocaleString()}</span>{" "}
          {hits === 1 ? "hit" : "hits"}
        </p>
        <p>Last {formatTimestamp(lastAt)}</p>
      </div>
    </div>
  );
}

export default function VisitorsByPropertyLog({
  groups,
}: {
  groups: VisitorPropertyGroup[];
}) {
  const [openProperties, setOpenProperties] = useState<Set<string>>(
    () => new Set(),
  );
  const [openDays, setOpenDays] = useState<Set<string>>(() => new Set());

  function toggleProperty(mlsId: string) {
    setOpenProperties((prev) => {
      const next = new Set(prev);
      if (next.has(mlsId)) next.delete(mlsId);
      else next.add(mlsId);
      return next;
    });
  }

  function toggleDay(mlsId: string, dayKey: string) {
    const key = `${mlsId}\0${dayKey}`;
    setOpenDays((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  if (groups.length === 0) {
    return (
      <div className="px-5 sm:px-6 py-10">
        <p className="text-sm text-slate">
          No property views in the retained visitor log yet.
        </p>
      </div>
    );
  }

  return (
    <ul className="divide-y divide-charcoal/[0.08]">
      {groups.map((group) => {
        const propertyOpen = openProperties.has(group.mlsId);
        return (
          <li key={group.mlsId} className="px-5 sm:px-6 py-3">
            <div className="flex items-start gap-3">
              <DrillToggle
                expanded={propertyOpen}
                onToggle={() => toggleProperty(group.mlsId)}
                label={group.label}
              />
              <div className="min-w-0 flex-1">
                <button
                  type="button"
                  onClick={() => toggleProperty(group.mlsId)}
                  className="w-full text-left"
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                    <p className="font-mono text-[12px] tracking-[0.08em] text-navy font-medium">
                      {group.label}
                    </p>
                    <p className="font-mono text-[11px] tabular-nums text-charcoal/50">
                      {group.visitorCount.toLocaleString()} visitors ·{" "}
                      {group.hits.toLocaleString()} hits
                    </p>
                  </div>
                  <p className="mt-0.5 font-mono text-[10px] text-charcoal/40">
                    MLS {group.mlsId} · {group.days.length.toLocaleString()} day
                    {group.days.length === 1 ? "" : "s"} · last{" "}
                    {formatTimestamp(group.lastAt)}
                  </p>
                </button>

                {propertyOpen ? (
                  <ul className="mt-3 ml-1 border-l border-charcoal/[0.08] pl-3 sm:pl-4 space-y-2">
                    {group.days.map((day) => {
                      const dayKey = `${group.mlsId}\0${day.dayKey}`;
                      const dayOpen = openDays.has(dayKey);
                      return (
                        <li key={day.dayKey} className="py-1">
                          <div className="flex items-start gap-3">
                            <DrillToggle
                              expanded={dayOpen}
                              onToggle={() =>
                                toggleDay(group.mlsId, day.dayKey)
                              }
                              label={day.dayLabel}
                            />
                            <div className="min-w-0 flex-1">
                              <button
                                type="button"
                                onClick={() =>
                                  toggleDay(group.mlsId, day.dayKey)
                                }
                                className="w-full text-left"
                              >
                                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                                  <p className="text-sm text-slate font-medium">
                                    {day.dayLabel}
                                  </p>
                                  <p className="font-mono text-[11px] tabular-nums text-charcoal/50">
                                    {day.visitorCount.toLocaleString()} ·{" "}
                                    {day.hits.toLocaleString()} hits
                                  </p>
                                </div>
                              </button>

                              {dayOpen ? (
                                <ul className="mt-2 ml-1 border-l border-charcoal/[0.06] pl-3 sm:pl-4 divide-y divide-charcoal/[0.06]">
                                  {day.visitors.map((row) => (
                                    <li
                                      key={row.visitor.vid}
                                      className="py-3"
                                    >
                                      <DayVisitorRow
                                        visitor={row.visitor}
                                        hits={row.hits}
                                        lastAt={row.lastAt}
                                      />
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
