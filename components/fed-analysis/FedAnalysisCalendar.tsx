"use client";

import { useMemo, useState } from "react";
import {
  decisionLabel,
  formatFedFundsRange,
  meetingOnDay,
  type FomcMeeting,
} from "@/lib/fed-fomc-calendar";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

function decisionChipClass(decision: FomcMeeting["decision"]): string {
  if (decision === "cut") return "bg-sage/15 text-sage border-sage/30";
  if (decision === "hike") return "bg-coral/15 text-coral border-coral/30";
  if (decision === "hold") return "bg-navy/10 text-navy border-navy/20";
  return "bg-gold/15 text-navy border-gold/35";
}

export default function FedAnalysisCalendar({
  meetings,
  initialYear,
  initialMonth,
}: {
  meetings: readonly FomcMeeting[];
  initialYear: number;
  initialMonth: number;
}) {
  const [cursor, setCursor] = useState(() => ({
    year: initialYear,
    month: initialMonth,
  }));

  const monthLabel = useMemo(
    () =>
      new Intl.DateTimeFormat("en-US", {
        month: "long",
        year: "numeric",
      }).format(new Date(cursor.year, cursor.month, 1)),
    [cursor.year, cursor.month],
  );

  const cells = useMemo(() => {
    const first = new Date(cursor.year, cursor.month, 1);
    const startPad = first.getDay();
    const daysInMonth = new Date(cursor.year, cursor.month + 1, 0).getDate();
    const out: { day: number | null; meeting: FomcMeeting | null }[] = [];
    for (let i = 0; i < startPad; i++) out.push({ day: null, meeting: null });
    for (let day = 1; day <= daysInMonth; day++) {
      out.push({
        day,
        meeting: meetingOnDay(cursor.year, cursor.month, day, meetings),
      });
    }
    while (out.length % 7 !== 0) out.push({ day: null, meeting: null });
    return out;
  }, [cursor.year, cursor.month, meetings]);

  const monthMeetings = useMemo(() => {
    const seen = new Set<string>();
    const list: FomcMeeting[] = [];
    for (const cell of cells) {
      if (!cell.meeting || seen.has(cell.meeting.id)) continue;
      seen.add(cell.meeting.id);
      list.push(cell.meeting);
    }
    return list;
  }, [cells]);

  const shiftMonth = (delta: number) => {
    setCursor((prev) => {
      const d = new Date(prev.year, prev.month + delta, 1);
      return { year: d.getFullYear(), month: d.getMonth() };
    });
  };

  const today = new Date();
  const isToday = (day: number) =>
    day === today.getDate() &&
    cursor.month === today.getMonth() &&
    cursor.year === today.getFullYear();

  return (
    <div className="rounded-2xl border border-charcoal/[0.08] bg-white shadow-sm shadow-charcoal/[0.04] overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b border-charcoal/[0.08] bg-cream/40 px-4 py-3 sm:px-5">
        <button
          type="button"
          onClick={() => shiftMonth(-1)}
          className="rounded-md border border-charcoal/15 bg-white px-2.5 py-1.5 font-mono text-[10px] tracking-[0.12em] uppercase text-navy hover:border-navy/30"
        >
          Prev
        </button>
        <p className="font-serif text-xl text-navy">{monthLabel}</p>
        <button
          type="button"
          onClick={() => shiftMonth(1)}
          className="rounded-md border border-charcoal/15 bg-white px-2.5 py-1.5 font-mono text-[10px] tracking-[0.12em] uppercase text-navy hover:border-navy/30"
        >
          Next
        </button>
      </div>

      <div className="grid grid-cols-7 border-b border-charcoal/[0.06] bg-cream/20">
        {WEEKDAYS.map((d) => (
          <div
            key={d}
            className="px-1 py-2 text-center font-mono text-[9px] tracking-[0.14em] uppercase text-charcoal/45"
          >
            {d}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 auto-rows-[minmax(4.5rem,1fr)]">
        {cells.map((cell, i) => {
          const meeting = cell.meeting;
          const isDecisionDay =
            meeting != null &&
            cell.day != null &&
            meeting.endDate ===
              `${cursor.year}-${String(cursor.month + 1).padStart(2, "0")}-${String(cell.day).padStart(2, "0")}`;
          return (
            <div
              key={`${cursor.year}-${cursor.month}-${i}`}
              className={`min-h-[4.5rem] border-b border-r border-charcoal/[0.06] p-1.5 ${
                cell.day == null ? "bg-cream/30" : ""
              } ${meeting ? "bg-gold/[0.07]" : ""}`}
            >
              {cell.day != null ? (
                <>
                  <span
                    className={`inline-flex h-6 min-w-[1.5rem] items-center justify-center rounded-full px-1 font-mono text-[11px] tabular-nums ${
                      isToday(cell.day)
                        ? "bg-navy text-white"
                        : "text-charcoal/55"
                    }`}
                  >
                    {cell.day}
                  </span>
                  {meeting ? (
                    <p
                      className={`mt-1 line-clamp-2 font-mono text-[9px] tracking-[0.08em] uppercase leading-tight ${
                        isDecisionDay ? "text-navy font-semibold" : "text-gold"
                      }`}
                    >
                      {isDecisionDay ? "FOMC decision" : "FOMC"}
                      {meeting.hasSep && isDecisionDay ? " · SEP" : ""}
                    </p>
                  ) : null}
                </>
              ) : null}
            </div>
          );
        })}
      </div>

      {monthMeetings.length > 0 ? (
        <ul className="divide-y divide-charcoal/[0.06] border-t border-charcoal/[0.08]">
          {monthMeetings.map((m) => (
            <li
              key={m.id}
              className="flex flex-wrap items-start justify-between gap-3 px-4 py-3.5 sm:px-5"
            >
              <div className="min-w-0">
                <p className="font-mono text-[11px] tracking-[0.12em] uppercase text-navy">
                  {formatMeetingSpan(m)}
                  {m.hasSep ? " · SEP" : ""}
                </p>
                {m.note ? (
                  <p className="mt-1 text-xs text-slate leading-snug">{m.note}</p>
                ) : null}
                {m.statementUrl ? (
                  <a
                    href={m.statementUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-1 inline-block text-xs text-navy underline decoration-navy/25 underline-offset-2 hover:decoration-navy"
                  >
                    Policy statement
                  </a>
                ) : null}
              </div>
              <div className="flex flex-col items-end gap-1">
                <span
                  className={`inline-flex rounded-full border px-2 py-0.5 font-mono text-[10px] tracking-[0.12em] uppercase ${decisionChipClass(m.decision)}`}
                >
                  {decisionLabel(m.decision, m.basisPoints)}
                </span>
                {m.targetRangeLow != null ? (
                  <span className="font-mono text-[11px] tabular-nums text-slate">
                    {formatFedFundsRange(m.targetRangeLow, m.targetRangeHigh)}
                  </span>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="px-5 py-6 text-center text-sm text-slate">
          No regularly scheduled FOMC meetings this month.
        </p>
      )}
    </div>
  );
}

function formatMeetingSpan(m: FomcMeeting): string {
  const start = new Date(`${m.startDate}T12:00:00`);
  const end = new Date(`${m.endDate}T12:00:00`);
  const sameMonth = start.getMonth() === end.getMonth();
  const startFmt = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(start);
  const endFmt = new Intl.DateTimeFormat("en-US", {
    month: sameMonth ? undefined : "short",
    day: "numeric",
    year: "numeric",
  }).format(end);
  return `${startFmt} – ${endFmt}`;
}
