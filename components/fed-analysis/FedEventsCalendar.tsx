"use client";

import { useMemo, useState } from "react";
import {
  cpiReleasesOnDay,
  formatCpiPct,
  formatCpiReferenceMonth,
  type CpiRelease,
} from "@/lib/cpi-calendar";
import {
  decisionLabel,
  formatFedFundsRange,
  formatFomcMeetingSpan,
  meetingOnDay,
  type FomcMeeting,
} from "@/lib/fed-fomc-calendar";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

export default function FedEventsCalendar({
  meetings,
  cpiReleases,
  initialYear,
  initialMonth,
}: {
  meetings: readonly FomcMeeting[];
  cpiReleases: readonly CpiRelease[];
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
    const out: {
      day: number | null;
      meeting: FomcMeeting | null;
      cpi: CpiRelease[];
    }[] = [];
    for (let i = 0; i < startPad; i++) {
      out.push({ day: null, meeting: null, cpi: [] });
    }
    for (let day = 1; day <= daysInMonth; day++) {
      out.push({
        day,
        meeting: meetingOnDay(cursor.year, cursor.month, day, meetings),
        cpi: cpiReleasesOnDay(cursor.year, cursor.month, day, cpiReleases),
      });
    }
    while (out.length % 7 !== 0) {
      out.push({ day: null, meeting: null, cpi: [] });
    }
    return out;
  }, [cursor.year, cursor.month, meetings, cpiReleases]);

  const monthMeetings = useMemo(
    () =>
      meetings.filter((m) => {
        const end = new Date(m.endDate + "T12:00:00");
        return (
          end.getFullYear() === cursor.year && end.getMonth() === cursor.month
        );
      }),
    [meetings, cursor.year, cursor.month],
  );

  const monthCpi = useMemo(
    () =>
      cpiReleases.filter((r) => {
        const d = new Date(r.releaseDate + "T12:00:00");
        return d.getFullYear() === cursor.year && d.getMonth() === cursor.month;
      }),
    [cpiReleases, cursor.year, cursor.month],
  );

  function shiftMonth(delta: number) {
    setCursor((c) => {
      const d = new Date(c.year, c.month + delta, 1);
      return { year: d.getFullYear(), month: d.getMonth() };
    });
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-charcoal/[0.08] bg-white shadow-sm shadow-charcoal/[0.04]">
      <div className="flex items-center justify-between gap-3 border-b border-charcoal/[0.08] bg-cream/40 px-4 py-3 sm:px-5">
        <button
          type="button"
          onClick={() => shiftMonth(-1)}
          className="rounded-full border border-charcoal/15 px-3 py-1 font-mono text-[10px] tracking-[0.12em] uppercase text-navy hover:border-navy/30"
        >
          Prev
        </button>
        <div className="text-center">
          <p className="font-mono text-[11px] tracking-[0.2em] uppercase text-gold">
            Markets calendar
          </p>
          <p className="mt-0.5 font-serif text-xl text-navy">{monthLabel}</p>
        </div>
        <button
          type="button"
          onClick={() => shiftMonth(1)}
          className="rounded-full border border-charcoal/15 px-3 py-1 font-mono text-[10px] tracking-[0.12em] uppercase text-navy hover:border-navy/30"
        >
          Next
        </button>
      </div>

      <div className="px-3 py-3 sm:px-4">
        <div className="mb-2 grid grid-cols-7 gap-1">
          {WEEKDAYS.map((d) => (
            <p
              key={d}
              className="text-center font-mono text-[9px] tracking-[0.12em] uppercase text-charcoal/40"
            >
              {d}
            </p>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {cells.map((cell, i) => {
            if (cell.day == null) {
              return <div key={`pad-${i}`} className="min-h-[4.25rem]" />;
            }
            const hasFomc = Boolean(cell.meeting);
            const hasCpi = cell.cpi.length > 0;
            return (
              <div
                key={cell.day}
                className={`min-h-[4.25rem] rounded-lg border px-1 py-1 ${
                  hasFomc || hasCpi
                    ? "border-navy/20 bg-cream/50"
                    : "border-transparent"
                }`}
              >
                <p className="font-mono text-[10px] tabular-nums text-charcoal/45">
                  {cell.day}
                </p>
                {hasFomc ? (
                  <p className="mt-0.5 truncate font-mono text-[8px] tracking-[0.08em] uppercase text-navy">
                    FOMC
                    {cell.meeting?.decision
                      ? ` · ${cell.meeting.decision}`
                      : ""}
                  </p>
                ) : null}
                {hasCpi ? (
                  <p className="mt-0.5 truncate font-mono text-[8px] tracking-[0.08em] uppercase text-sky">
                    CPI
                  </p>
                ) : null}
              </div>
            );
          })}
        </div>

        <ul className="mt-3 flex flex-wrap gap-3 font-mono text-[10px] tracking-[0.12em] uppercase text-charcoal/45">
          <li className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-navy" aria-hidden /> FOMC
          </li>
          <li className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-sky" aria-hidden /> CPI
          </li>
        </ul>

        {(monthMeetings.length > 0 || monthCpi.length > 0) ? (
          <ul className="mt-3 space-y-2 border-t border-charcoal/[0.08] pt-3">
            {monthMeetings.map((m) => (
              <li key={m.id} className="text-sm text-slate">
                <span className="font-mono text-[10px] tracking-[0.12em] uppercase text-navy">
                  FOMC
                </span>{" "}
                {formatFomcMeetingSpan(m.startDate, m.endDate)}
                {m.decision != null
                  ? ` · ${decisionLabel(m.decision, m.basisPoints)} · ${formatFedFundsRange(m.targetRangeLow, m.targetRangeHigh)}`
                  : " · Pending"}
              </li>
            ))}
            {monthCpi.map((r) => (
              <li key={r.id} className="text-sm text-slate">
                <span className="font-mono text-[10px] tracking-[0.12em] uppercase text-sky">
                  CPI
                </span>{" "}
                {formatCpiReferenceMonth(r.referenceMonth)} · release{" "}
                {r.releaseDate}
                {r.yoyPct != null || r.momPct != null
                  ? ` · ${[
                      r.yoyPct != null ? `${formatCpiPct(r.yoyPct)} YoY` : null,
                      r.momPct != null ? `${formatCpiPct(r.momPct)} MoM` : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}`
                  : " · Awaiting print"}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  );
}
