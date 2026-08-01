"use client";

import { useMemo, useState } from "react";
import {
  cpiHasPrint,
  formatCpiPct,
  formatCpiReferenceMonth,
  type CpiRelease,
} from "@/lib/cpi-calendar";
import {
  formatFomcDayWithWeekday,
  parseFomcYmd,
} from "@/lib/fed-fomc-calendar";

type SortKey = "date" | "yoy" | "mom";
type SortDir = "desc" | "asc";

function SortButton({
  label,
  active,
  dir,
  onClick,
}: {
  label: string;
  active: boolean;
  dir: SortDir;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 font-mono text-[10px] tracking-[0.12em] uppercase transition-colors ${
        active
          ? "border-navy/35 bg-navy/5 text-navy"
          : "border-charcoal/15 bg-white text-charcoal/50 hover:border-navy/25 hover:text-navy"
      }`}
    >
      {label}
      {active ? (
        <span aria-hidden className="tabular-nums">
          {dir === "desc" ? "↓" : "↑"}
        </span>
      ) : null}
    </button>
  );
}

export default function FedRecentCpi({
  releases,
}: {
  releases: readonly CpiRelease[];
}) {
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const rows = useMemo(() => {
    const printed = releases.filter(cpiHasPrint);
    const dir = sortDir === "desc" ? -1 : 1;
    return [...printed]
      .sort((a, b) => {
        if (sortKey === "yoy") {
          const ra = a.yoyPct ?? -999;
          const rb = b.yoyPct ?? -999;
          if (ra !== rb) return (ra - rb) * dir;
        }
        if (sortKey === "mom") {
          const ra = a.momPct ?? -999;
          const rb = b.momPct ?? -999;
          if (ra !== rb) return (ra - rb) * dir;
        }
        const ta = parseFomcYmd(a.releaseDate).getTime();
        const tb = parseFomcYmd(b.releaseDate).getTime();
        return (ta - tb) * dir;
      })
      .slice(0, 12);
  }, [releases, sortKey, sortDir]);

  function toggleSort(next: SortKey) {
    if (sortKey === next) {
      setSortDir((d) => (d === "desc" ? "asc" : "desc"));
      return;
    }
    setSortKey(next);
    setSortDir("desc");
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="font-mono text-[11px] tracking-[0.2em] uppercase text-gold">
          Recent CPI prints
        </p>
        <div
          className="flex flex-wrap items-center gap-1.5"
          role="group"
          aria-label="Sort recent CPI"
        >
          <SortButton
            label="Date"
            active={sortKey === "date"}
            dir={sortDir}
            onClick={() => toggleSort("date")}
          />
          <SortButton
            label="YoY"
            active={sortKey === "yoy"}
            dir={sortDir}
            onClick={() => toggleSort("yoy")}
          />
          <SortButton
            label="MoM"
            active={sortKey === "mom"}
            dir={sortDir}
            onClick={() => toggleSort("mom")}
          />
        </div>
      </div>
      <ol className="overflow-hidden rounded-2xl border border-charcoal/[0.08] bg-white shadow-sm shadow-charcoal/[0.04]">
        {rows.length === 0 ? (
          <li className="px-4 py-6 text-sm text-slate sm:px-5">
            No CPI prints recorded in the local calendar yet.
          </li>
        ) : (
          rows.map((r, i) => (
            <li
              key={r.id}
              className={`flex items-start justify-between gap-3 px-4 py-3.5 sm:px-5 ${
                i > 0 ? "border-t border-charcoal/[0.06]" : ""
              }`}
            >
              <div className="min-w-0">
                <p className="font-mono text-[11px] tracking-[0.1em] uppercase text-navy">
                  {formatCpiReferenceMonth(r.referenceMonth)}
                </p>
                <p className="mt-0.5 text-xs text-slate">
                  Released{" "}
                  {formatFomcDayWithWeekday(r.releaseDate, { month: "short" })}
                </p>
                {(r.highlights?.length ?? 0) > 0 ? (
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {r.highlights!.slice(0, 2).map((h, hi) => (
                      <span
                        key={`${r.id}-${h.label}-${hi}`}
                        className={`max-w-[10rem] truncate rounded-full border px-1.5 py-0.5 font-mono text-[9px] tracking-[0.08em] uppercase ${
                          h.direction === "up"
                            ? "border-coral/30 bg-coral/10 text-coral"
                            : h.direction === "down"
                              ? "border-sage/30 bg-sage/10 text-sage"
                              : "border-charcoal/15 text-charcoal/50"
                        }`}
                        title={h.label}
                      >
                        {h.label}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
              <p className="shrink-0 text-right font-mono text-[12px] tabular-nums text-navy">
                {formatCpiPct(r.yoyPct)} YoY
                <span className="block text-charcoal/45">
                  {formatCpiPct(r.momPct)} MoM
                </span>
              </p>
            </li>
          ))
        )}
      </ol>
    </div>
  );
}
