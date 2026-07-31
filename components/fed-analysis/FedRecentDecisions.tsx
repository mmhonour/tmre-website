"use client";

import { useMemo, useState } from "react";
import {
  decisionLabel,
  formatFedFundsRange,
  formatFomcMeetingSpan,
  parseFomcYmd,
  type FomcMeeting,
} from "@/lib/fed-fomc-calendar";

type SortKey = "date" | "decision" | "rate";
type SortDir = "desc" | "asc";

const DECISION_RANK: Record<NonNullable<FomcMeeting["decision"]>, number> = {
  cut: 0,
  hold: 1,
  hike: 2,
};

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
          {dir === "desc" ? "Γåô" : "Γåæ"}
        </span>
      ) : null}
    </button>
  );
}

export default function FedRecentDecisions({
  meetings,
}: {
  meetings: readonly FomcMeeting[];
}) {
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const rows = useMemo(() => {
    const decided = meetings.filter((m) => m.decision != null);
    const dir = sortDir === "desc" ? -1 : 1;
    return [...decided]
      .sort((a, b) => {
        if (sortKey === "decision") {
          const ra = DECISION_RANK[a.decision!] ?? 9;
          const rb = DECISION_RANK[b.decision!] ?? 9;
          if (ra !== rb) return (ra - rb) * (sortDir === "asc" ? 1 : -1);
        }
        if (sortKey === "rate") {
          const ra = a.targetRangeHigh ?? a.targetRangeLow ?? -1;
          const rb = b.targetRangeHigh ?? b.targetRangeLow ?? -1;
          if (ra !== rb) return (ra - rb) * dir;
        }
        const ta = parseFomcYmd(a.endDate).getTime();
        const tb = parseFomcYmd(b.endDate).getTime();
        return (ta - tb) * dir;
      })
      .slice(0, 12);
  }, [meetings, sortKey, sortDir]);

  function toggleSort(next: SortKey) {
    if (sortKey === next) {
      setSortDir((d) => (d === "desc" ? "asc" : "desc"));
      return;
    }
    setSortKey(next);
    setSortDir(next === "decision" ? "asc" : "desc");
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="font-mono text-[11px] tracking-[0.2em] uppercase text-gold">
          Recent decisions
        </p>
        <div
          className="flex flex-wrap items-center gap-1.5"
          role="group"
          aria-label="Sort recent decisions"
        >
          <SortButton
            label="Date"
            active={sortKey === "date"}
            dir={sortDir}
            onClick={() => toggleSort("date")}
          />
          <SortButton
            label="Decision"
            active={sortKey === "decision"}
            dir={sortDir}
            onClick={() => toggleSort("decision")}
          />
          <SortButton
            label="Rate"
            active={sortKey === "rate"}
            dir={sortDir}
            onClick={() => toggleSort("rate")}
          />
        </div>
      </div>
      <ol className="overflow-hidden rounded-2xl border border-charcoal/[0.08] bg-white shadow-sm shadow-charcoal/[0.04]">
        {rows.map((m, i) => (
          <li
            key={m.id}
            className={`flex items-start justify-between gap-3 px-4 py-3.5 sm:px-5 ${
              i > 0 ? "border-t border-charcoal/[0.06]" : ""
            }`}
          >
            <div>
              <p className="font-mono text-[11px] tracking-[0.1em] uppercase text-navy">
                {formatFomcMeetingSpan(m.startDate, m.endDate)}
              </p>
              <p className="mt-0.5 text-xs text-slate">
                {decisionLabel(m.decision, m.basisPoints)}
              </p>
            </div>
            <p className="shrink-0 font-mono text-[12px] tabular-nums text-navy">
              {formatFedFundsRange(m.targetRangeLow, m.targetRangeHigh)}
            </p>
          </li>
        ))}
      </ol>
    </div>
  );
}
