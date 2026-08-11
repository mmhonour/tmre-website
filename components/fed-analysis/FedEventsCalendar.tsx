"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
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

/**
 * Markets calendar control — sidebar trigger + full month grid in a dismissible
 * popup. Upcoming next-3-months dates render separately under FOMC / CPI.
 */
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
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [cursor, setCursor] = useState(() => ({
    year: initialYear,
    month: initialMonth,
  }));

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open]);

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

  const popup =
    open && mounted
      ? createPortal(
          <div
            className="fixed inset-0 z-[80] flex items-start justify-center overflow-y-auto bg-navy/50 p-4 sm:p-8"
            role="dialog"
            aria-modal="true"
            aria-labelledby="fed-markets-calendar-title"
            onClick={() => setOpen(false)}
          >
            <div
              className="relative my-4 w-full max-w-lg overflow-hidden rounded-2xl border border-charcoal/[0.08] bg-white shadow-xl shadow-charcoal/20"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start justify-between gap-3 border-b border-charcoal/[0.08] bg-cream/40 px-4 py-3 sm:px-5">
                <div className="min-w-0">
                  <p
                    id="fed-markets-calendar-title"
                    className="font-mono text-[11px] tracking-[0.2em] uppercase text-gold"
                  >
                    Markets calendar
                  </p>
                  <p className="mt-0.5 font-serif text-xl text-navy">
                    {monthLabel}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="shrink-0 rounded-full border border-charcoal/15 px-3 py-1 font-mono text-[10px] tracking-[0.12em] uppercase text-navy hover:border-navy/30"
                >
                  Dismiss
                </button>
              </div>

              <div className="flex items-center justify-between gap-3 px-4 py-3 sm:px-5">
                <button
                  type="button"
                  onClick={() => shiftMonth(-1)}
                  className="rounded-full border border-charcoal/15 px-3 py-1 font-mono text-[10px] tracking-[0.12em] uppercase text-navy hover:border-navy/30"
                >
                  Prev
                </button>
                <p className="font-serif text-lg text-navy">{monthLabel}</p>
                <button
                  type="button"
                  onClick={() => shiftMonth(1)}
                  className="rounded-full border border-charcoal/15 px-3 py-1 font-mono text-[10px] tracking-[0.12em] uppercase text-navy hover:border-navy/30"
                >
                  Next
                </button>
              </div>

              <div id="fed-markets-calendar-body" className="px-3 pb-4 sm:px-4">
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
                    <span className="h-2 w-2 rounded-full bg-navy" aria-hidden />{" "}
                    FOMC
                  </li>
                  <li className="inline-flex items-center gap-1.5">
                    <span
                      className="h-2 w-2 rounded-full bg-coral/80"
                      aria-hidden
                    />{" "}
                    CPI up MoM
                  </li>
                  <li className="inline-flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-sage" aria-hidden />{" "}
                    CPI down MoM
                  </li>
                  <li className="inline-flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-sky" aria-hidden />{" "}
                    CPI pending
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
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            </div>
          </div>,
          document.body,
        )
      : null;

  return (
    <>
      <div className="flex h-full flex-col px-5 py-5 sm:px-6 lg:px-5">
        <p className="font-mono text-[11px] tracking-[0.2em] uppercase text-gold">
          Markets calendar
        </p>
        <p className="mt-3 font-serif text-xl text-navy sm:text-2xl">
          {monthLabel}
        </p>
        <p className="mt-2 text-sm text-slate">
          Full month grid of FOMC and CPI dates — opens as a popup until
          dismissed.
        </p>
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-expanded={open}
          aria-controls="fed-markets-calendar-body"
          className="mt-4 self-start rounded-full border border-navy/25 bg-navy/[0.04] px-4 py-2 font-mono text-[10px] tracking-[0.14em] uppercase text-navy transition-colors hover:border-navy/40 hover:bg-navy/[0.08]"
        >
          Expand calendar
        </button>
      </div>
      {popup}
    </>
  );
}
