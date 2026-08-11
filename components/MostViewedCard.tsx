"use client";

import Link from "next/link";
import { useState } from "react";
import type {
  ContentViewAudienceHit,
  ContentViewAudienceProviderGroup,
  ContentViewSummaryWithAudience,
} from "@/lib/content-view-audience";
import { contentViewLabel, type ContentViewSummary } from "@/lib/content-views";
import { formatExactCompactPrice } from "@/lib/format-exact-compact-price";
import {
  formatVisitorIdentity,
  visitorIdentitySourceLabel,
} from "@/lib/visitors-types";

function formatDay(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
  }).format(date);
}

function formatTimestamp(iso: string | null | undefined): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function metaLine(row: ContentViewSummary): string {
  if (row.kind === "page") return row.path;
  const parts = [row.town, row.status].filter(Boolean) as string[];
  if (typeof row.price === "number" && row.price > 0) {
    parts.push(formatExactCompactPrice(row.price));
  }
  if (row.mlsId && row.mlsId.length <= 16) {
    parts.push(`MLS ${row.mlsId}`);
  }
  return parts.join(" · ");
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

function AudienceVisitorRow({ hit }: { hit: ContentViewAudienceHit }) {
  const { visitor, views, lastViewedAt } = hit;
  return (
    <div className="grid grid-cols-1 gap-2 pl-2 sm:pl-4 lg:grid-cols-[minmax(12rem,1.2fr)_minmax(0,1fr)_auto] lg:items-start lg:gap-6">
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
        <p className="truncate font-mono text-[10px] text-charcoal/35">
          {visitor.vid}
          {visitor.ip ? ` · ${visitor.ip}` : ""}
        </p>
      </div>
      <div className="shrink-0 space-y-1 font-mono text-[11px] tabular-nums text-charcoal/55 lg:text-right">
        <p>
          <span className="font-semibold text-navy">
            {views.toLocaleString()}
          </span>{" "}
          {views === 1 ? "view" : "views"}
        </p>
        <p>Last {formatTimestamp(lastViewedAt)}</p>
      </div>
    </div>
  );
}

function AudienceDrilldown({
  audience,
  propertyKey,
}: {
  audience: ContentViewAudienceProviderGroup[];
  propertyKey: string;
}) {
  const [openProviders, setOpenProviders] = useState<Set<string>>(
    () => new Set(),
  );
  const [openLocations, setOpenLocations] = useState<Set<string>>(
    () => new Set(),
  );

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

  if (audience.length === 0) {
    return (
      <p className="mt-2 pl-9 text-xs text-charcoal/45">
        No visitor records linked for these views yet.
      </p>
    );
  }

  return (
    <ul className="mt-3 ml-1 space-y-2 border-l border-charcoal/[0.08] pl-3 sm:pl-4">
      {audience.map((group) => {
        const providerOpen = openProviders.has(group.provider);
        return (
          <li key={`${propertyKey}:${group.provider}`} className="py-1">
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
                    <p className="font-mono text-[11px] font-medium tracking-[0.1em] uppercase text-navy">
                      {group.provider}
                    </p>
                    <p className="font-mono text-[11px] tabular-nums text-charcoal/50">
                      {group.visitorCount.toLocaleString()} visitor
                      {group.visitorCount === 1 ? "" : "s"} ·{" "}
                      {group.views.toLocaleString()} views
                    </p>
                  </div>
                </button>

                {providerOpen ? (
                  <ul className="mt-2 ml-1 space-y-2 border-l border-charcoal/[0.06] pl-3 sm:pl-4">
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
                                  <p className="text-sm font-medium text-slate">
                                    {loc.location}
                                  </p>
                                  <p className="font-mono text-[11px] tabular-nums text-charcoal/50">
                                    {loc.visitorCount.toLocaleString()} ·{" "}
                                    {loc.views.toLocaleString()} views
                                  </p>
                                </div>
                              </button>

                              {locOpen ? (
                                <ul className="mt-2 ml-1 divide-y divide-charcoal/[0.06] border-l border-charcoal/[0.06] pl-3 sm:pl-4">
                                  {loc.visitors.map((hit) => (
                                    <li key={hit.visitor.vid} className="py-3">
                                      <AudienceVisitorRow hit={hit} />
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

function hasAudience(
  row: ContentViewSummary | ContentViewSummaryWithAudience,
): row is ContentViewSummaryWithAudience {
  return Array.isArray((row as ContentViewSummaryWithAudience).audience);
}

function Row({
  row,
  rank,
}: {
  row: ContentViewSummary | ContentViewSummaryWithAudience;
  rank: number;
}) {
  const label = contentViewLabel(row);
  const audience = hasAudience(row) ? row.audience : null;
  const [open, setOpen] = useState(false);
  const canDrill = audience != null;

  return (
    <li className="px-5 py-3 sm:px-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          {canDrill ? (
            <DrillToggle
              expanded={open}
              onToggle={() => setOpen((v) => !v)}
              label={label}
            />
          ) : null}
          <span className="mt-1 inline-flex shrink-0 font-mono text-[11px] tabular-nums text-charcoal/35">
            {rank}
          </span>
          <div className="min-w-0">
            {row.kind === "listing" && row.mlsId ? (
              <Link
                href={`/listings/${row.mlsId}`}
                className="break-words text-sm text-navy hover:text-gold hover:underline underline-offset-2"
              >
                {label}
              </Link>
            ) : (
              <p className="break-words text-sm text-navy">{label}</p>
            )}
            <p className="mt-0.5 break-words font-mono text-[10px] text-charcoal/40">
              {metaLine(row)}
            </p>
            {canDrill ? (
              <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                className="mt-1 font-mono text-[10px] tracking-[0.1em] uppercase text-charcoal/45 hover:text-navy"
              >
                {open ? "Hide who viewed" : "Show who viewed"}
              </button>
            ) : null}
          </div>
        </div>
        <div className="shrink-0 text-right font-mono text-[11px] tabular-nums text-charcoal/55">
          <p>
            <span className="font-semibold text-navy">
              {row.views.toLocaleString()}
            </span>{" "}
            views
          </p>
          <p className="text-charcoal/40">
            {row.viewers.toLocaleString()} visitor
            {row.viewers === 1 ? "" : "s"} · {formatDay(row.lastViewedAt)}
          </p>
        </div>
      </div>
      {canDrill && open ? (
        <AudienceDrilldown audience={audience} propertyKey={row.contentKey} />
      ) : null}
    </li>
  );
}

export default function MostViewedCard({
  title,
  note,
  rows,
  emptyMessage,
  id,
}: {
  title: string;
  note?: string;
  rows: Array<ContentViewSummary | ContentViewSummaryWithAudience>;
  emptyMessage: string;
  id?: string;
}) {
  return (
    <div
      id={id}
      className="scroll-mt-24 overflow-hidden rounded-2xl border border-charcoal/[0.08] bg-white shadow-sm shadow-charcoal/[0.04]"
    >
      <div className="border-b border-charcoal/[0.08] bg-cream/40 px-5 py-4 sm:px-6">
        <p className="font-mono text-[11px] tracking-[0.2em] uppercase text-gold">
          {title}
        </p>
        {note ? (
          <p className="mt-1 text-xs leading-snug text-charcoal/55">{note}</p>
        ) : null}
      </div>
      {rows.length > 0 ? (
        <ul className="divide-y divide-charcoal/[0.08]">
          {rows.map((row, index) => (
            <Row key={row.contentKey} row={row} rank={index + 1} />
          ))}
        </ul>
      ) : (
        <p className="px-5 py-6 text-sm text-charcoal/55 sm:px-6">
          {emptyMessage}
        </p>
      )}
    </div>
  );
}
