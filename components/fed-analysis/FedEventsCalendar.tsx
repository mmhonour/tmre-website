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

function cpiDayTone(r: CpiRelease): string {
  if (r.momPct == null) return "border-sky/30 bg-sky/10";
  if (r.momPct > 0.05) return "border-coral/35 bg-coral/10";
  if (r.momPct < -0.05) return "border-sage/35 bg-sage/10";
  return "border-navy/25 bg-navy/[0.04]";
}

export default function FedEventsCalendar({
  meetings,
  cpiReleases,
  initialYear,
  initialMonth,
  embedded = false,
}: {
  meetings: readonly FomcMeeting[];
  cpiReleases: readonly CpiRelease[];
  initialYear: number;
  initialMonth: number;
  /** Flatter chrome when nested above Prevailing CPI. */
  embedded?: boolean;
}) {
  const [open, setOpen] = useState(false);
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
    <div
      className={
        embedded
          ? "w-full overflow-hidden rounded-xl border border-charcoal/[0.1] bg-cream/30"
          : "overflow-hidden rounded-2xl border border-charcoal/[0.08] bg-white shadow-sm shadow-charcoal/[0.04]"
      }
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls="fed-markets-calendar-body"
        className={`flex w-full items-center justify-between gap-3 text-left transition-colors ${
          embedded
            ? "px-3 py-2.5 hover:bg-cream/70 sm:px-4"
            : "bg-cream/40 px-4 py-3 hover:bg-cream/60 sm:px-5"
        }`}
      >
        <div className={`min-w-0 ${embedded ? "text-right sm:text-left" : ""}`}>
          <p className="font-mono text-[11px] tracking-[0.2em] uppercase text-gold">
            Markets calendar
          </p>
          <p className="mt-0.5 font-serif text-lg text-navy sm:text-xl">
            {monthLabel}
            {!open ? (
              <span className="ml-2 font-mono text-[10px] tracking-[0.1em] uppercase text-charcoal/40">
                · collapsed
              </span>
            ) : null}
          </p>
        </div>
        <span className="shrink-0 font-mono text-[10px] tracking-[0.12em] uppercase text-navy underline decoration-navy/25 underline-offset-2">
          {open ? "Minimize" : "Expand"}
        </span>
      </button>

      {open ? (
        <>
          <div className="flex items-center justify-between gap-3 border-t border-charcoal/[0.08] px-4 py-3 sm:px-5">
            <button
              type="button"
              onClick={() => shiftMonth(-1)}
              className="rounded-full border border-charcoal/15 px-3 py-1 font-mono text-[10px] tracking-[0.12em] uppercase text-navy hover:border-navy/30"
            >
              Prev
            </button>
            <p className="font-serif text-lg text-navy sm:text-xl">{monthLabel}</p>
            <button
              type="button"
              onClick={() => shiftMonth(1)}
              className="rounded-full border border-charcoal/15 px-3 py-1 font-mono text-[10px] tracking-[0.12em] uppercase text-navy hover:border-navy/30"
            >
              Next
            </button>
          </div>

          <div id="fed-markets-calendar-body" className="px-3 py-3 sm:px-4">
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
                const cpi = cell.cpi[0];
                const dayClass = hasCpi
                  ? cpiDayTone(cpi!)
                  : hasFomc
                    ? "border-navy/20 bg-cream/50"
                    : "border-transparent";
                const tipHighlight = cpi?.highlights?.[0]?.label;
                return (
                  <div
                    key={cell.day}
                    title={
                      hasCpi
                        ? [
                            "CPI",
                            cpi!.momPct != null
                              ? `${formatCpiPct(cpi!.momPct)} MoM`
                              : null,
                            tipHighlight,
                          ]
                            .filter(Boolean)
                            .join(" · ")
                        : undefined
                    }
                    className={`min-h-[4.25rem] rounded-lg border px-1 py-1 ${dayClass}`}
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
                      <>
                        <p className="mt-0.5 truncate font-mono text-[8px] tracking-[0.08em] uppercase text-sky">
                          CPI
                          {cpi!.momPct != null
                            ? ` · ${formatCpiPct(cpi!.momPct)}`
                            : ""}
                        </p>
                        {tipHighlight ? (
                          <p className="mt-0.5 truncate font-mono text-[7px] tracking-[0.06em] uppercase text-charcoal/45">
                            {tipHighlight}
                          </p>
                        ) : null}
                      </>
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
                <span className="h-2 w-2 rounded-full bg-coral/80" aria-hidden />{" "}
                CPI up MoM
              </li>
              <li className="inline-flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-sage" aria-hidden /> CPI
                down MoM
              </li>
              <li className="inline-flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-sky" aria-hidden /> CPI
                pending
              </li>
            </ul>

            {monthMeetings.length > 0 || monthCpi.length > 0 ? (
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
                          r.yoyPct != null
                            ? `${formatCpiPct(r.yoyPct)} YoY`
                            : null,
                          r.momPct != null
                            ? `${formatCpiPct(r.momPct)} MoM`
                            : null,
                        ]
                          .filter(Boolean)
                          .join(" · ")}`
                      : " · Awaiting print"}
                    {(r.highlights?.length ?? 0) > 0 ? (
                      <span className="mt-1 flex flex-wrap gap-1">
                        {r.highlights!.slice(0, 3).map((h, i) => (
                          <span
                            key={`${r.id}-${h.label}-${i}`}
                            className={`rounded-full border px-1.5 py-0.5 font-mono text-[9px] tracking-[0.08em] uppercase ${
                              h.direction === "up"
                                ? "border-coral/30 bg-coral/10 text-coral"
                                : h.direction === "down"
                                  ? "border-sage/30 bg-sage/10 text-sage"
                                  : "border-charcoal/15 text-charcoal/50"
                            }`}
                          >
                            {h.label}
                          </span>
                        ))}
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </>
      ) : null}
    </div>
  );
}
