"use client";

import { useState } from "react";
import {
  formatCpiPct,
  formatCpiReferenceMonth,
  type CpiRelease,
} from "@/lib/cpi-calendar";

function HighlightChip({
  label,
  direction,
  momPct,
}: {
  label: string;
  direction: "up" | "down" | "flat";
  momPct?: number | null;
}) {
  const tone =
    direction === "up"
      ? "border-coral/30 bg-coral/10 text-coral"
      : direction === "down"
        ? "border-sage/30 bg-sage/10 text-sage"
        : "border-charcoal/15 bg-cream/60 text-charcoal/60";
  return (
    <span
      className={`inline-flex max-w-full items-center gap-1 rounded-full border px-2 py-0.5 font-mono text-[10px] tracking-[0.08em] uppercase ${tone}`}
      title={label}
    >
      <span className="truncate">{label}</span>
      {momPct != null ? (
        <span className="tabular-nums opacity-80">{formatCpiPct(momPct)}</span>
      ) : null}
    </span>
  );
}

/**
 * Footer under Prevailing CPI: BLS release summary (toggle) left,
 * Read release (official URL) right. Panel hidden until toggled.
 */
export default function FedCpiSummary({
  release,
}: {
  release: CpiRelease | null;
}) {
  const [open, setOpen] = useState(false);

  const hasPanel =
    Boolean(release?.summary) ||
    Boolean(release?.excerpt) ||
    Boolean(release?.highlights?.length);
  const body = release?.summary || release?.excerpt || "";
  const highlights = release?.highlights ?? [];

  return (
    <div className="mt-auto pt-4">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-charcoal/[0.08] pt-3">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          disabled={!hasPanel}
          aria-expanded={open}
          aria-controls="cpi-release-summary-panel"
          className="font-mono text-[11px] tracking-[0.12em] uppercase text-navy underline decoration-navy/25 underline-offset-2 hover:decoration-navy disabled:cursor-not-allowed disabled:text-charcoal/35 disabled:no-underline"
        >
          {open ? "Hide BLS CPI release summary" : "BLS CPI release summary"}
        </button>
        {release?.releaseUrl ? (
          <a
            href={release.releaseUrl}
            target="_blank"
            rel="noreferrer"
            className="font-mono text-[11px] tracking-[0.12em] uppercase text-navy underline decoration-navy/25 underline-offset-2 hover:decoration-navy"
          >
            Read release
          </a>
        ) : (
          <span className="font-mono text-[11px] tracking-[0.12em] uppercase text-charcoal/30">
            Read release
          </span>
        )}
      </div>

      {open && hasPanel && release ? (
        <div
          id="cpi-release-summary-panel"
          className="mt-4 rounded-xl border border-charcoal/[0.08] bg-cream/25 px-4 py-4 sm:px-5"
        >
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="font-mono text-[11px] tracking-[0.2em] uppercase text-gold">
              BLS CPI release summary
            </p>
            <p className="font-mono text-[10px] tracking-[0.12em] uppercase text-charcoal/40">
              Official BLS language · not AI
            </p>
          </div>
          <p className="mt-2 text-xs leading-relaxed text-charcoal/50">
            Short excerpts from the Consumer Price Index news release for{" "}
            {formatCpiReferenceMonth(release.referenceMonth)}
            {release.releaseDate ? ` (released ${release.releaseDate})` : ""}.
          </p>

          <div className="mt-4 grid gap-5 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.9fr)] lg:items-start">
            <div>
              <p className="font-mono text-[10px] tracking-[0.16em] uppercase text-charcoal/40">
                Release
              </p>
              {body ? (
                <div className="mt-3 space-y-3 text-sm leading-relaxed text-slate">
                  {body.split(/\n\n+/).map((para, i) => (
                    <p
                      key={i}
                      className={
                        i === 0 ? "font-medium text-navy/90" : undefined
                      }
                    >
                      {para}
                    </p>
                  ))}
                </div>
              ) : (
                <p className="mt-3 text-sm text-charcoal/50">
                  No release paragraphs stored yet — highlights may still be
                  available from the scrape.
                </p>
              )}
            </div>

            <div className="rounded-xl border border-charcoal/[0.08] bg-white/70 px-4 py-4">
              <p className="font-mono text-[10px] tracking-[0.16em] uppercase text-charcoal/40">
                Highlights
              </p>
              {highlights.length > 0 ? (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {highlights.map((h, i) => (
                    <HighlightChip
                      key={`${h.label}-${i}`}
                      label={h.label}
                      direction={h.direction}
                      momPct={h.momPct}
                    />
                  ))}
                </div>
              ) : (
                <p className="mt-3 text-sm text-charcoal/50">
                  No category highlights stored for this print yet. Run Admin
                  Fed sync after the BLS release posts.
                </p>
              )}
              <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-charcoal/[0.06] pt-3 font-mono text-[11px] tabular-nums">
                <div>
                  <dt className="tracking-[0.12em] uppercase text-charcoal/40">
                    MoM
                  </dt>
                  <dd className="mt-0.5 text-navy">
                    {formatCpiPct(release.momPct)}
                  </dd>
                </div>
                <div>
                  <dt className="tracking-[0.12em] uppercase text-charcoal/40">
                    YoY
                  </dt>
                  <dd className="mt-0.5 text-navy">
                    {formatCpiPct(release.yoyPct)}
                  </dd>
                </div>
                <div>
                  <dt className="tracking-[0.12em] uppercase text-charcoal/40">
                    Core MoM
                  </dt>
                  <dd className="mt-0.5 text-navy">
                    {formatCpiPct(release.coreMomPct)}
                  </dd>
                </div>
                <div>
                  <dt className="tracking-[0.12em] uppercase text-charcoal/40">
                    Core YoY
                  </dt>
                  <dd className="mt-0.5 text-navy">
                    {formatCpiPct(release.coreYoyPct)}
                  </dd>
                </div>
              </dl>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
