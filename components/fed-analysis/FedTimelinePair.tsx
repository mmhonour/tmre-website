"use client";

import { useMemo, useState, type ReactNode } from "react";
import FedCpiTimeline, {
  selectTimelineCpi,
} from "@/components/fed-analysis/FedCpiTimeline";
import FedDecisionTimeline, {
  selectTimelineMeetings,
  type TimelineLookback,
} from "@/components/fed-analysis/FedDecisionTimeline";
import {
  cpiHasPrint,
  formatCpiPct,
  formatCpiReferenceMonth,
  type CpiRelease,
} from "@/lib/cpi-calendar";
import {
  decisionLabel,
  formatFedFundsRange,
  formatFomcDayWithWeekday,
  parseFomcYmd,
  type FomcMeeting,
} from "@/lib/fed-fomc-calendar";

const LOOKBACK_OPTIONS: { id: TimelineLookback; label: string }[] = [
  { id: 12, label: "1Y" },
  { id: 24, label: "2Y" },
  { id: 60, label: "5Y" },
  { id: "all", label: "Max" },
];

const FOMC_TITLE =
  "Federal Reserve Open Market Committee decision timeline";

function startOfLocalDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}

function rateMid(m: FomcMeeting): number | null {
  if (m.targetRangeLow == null || m.targetRangeHigh == null) return null;
  return (m.targetRangeLow + m.targetRangeHigh) / 2;
}

function decisionFill(decision: FomcMeeting["decision"]): string {
  if (decision === "cut") return "var(--color-sage)";
  if (decision === "hike") return "var(--color-coral)";
  if (decision === "hold") return "var(--color-navy)";
  return "var(--color-gold)";
}

function cpiFill(r: CpiRelease): string {
  if (r.momPct != null) {
    if (r.momPct > 0.05) return "var(--color-coral)";
    if (r.momPct < -0.05) return "var(--color-sage)";
    return "var(--color-navy)";
  }
  const yoy = r.yoyPct ?? 0;
  if (yoy >= 4) return "var(--color-coral)";
  if (yoy >= 2.5) return "var(--color-gold)";
  return "var(--color-sage)";
}

type ViewMode = "separate" | "overlay";

/**
 * Decision + CPI timelines with an optional overlay view (shared time axis,
 * shared percent scale — funds mid-range vs CPI-U YoY).
 */
export default function FedTimelinePair({
  meetings,
  releases,
  now = new Date(),
  defaultLookback = "all",
}: {
  meetings: readonly FomcMeeting[];
  releases: readonly CpiRelease[];
  now?: Date;
  defaultLookback?: TimelineLookback;
}) {
  const [mode, setMode] = useState<ViewMode>("separate");
  const [lookback, setLookback] = useState<TimelineLookback>(defaultLookback);

  const modeToggle = (
    <div
      role="group"
      aria-label="Timeline layout"
      className="flex flex-wrap items-center gap-1"
    >
      {(
        [
          { id: "separate" as const, label: "Separate" },
          { id: "overlay" as const, label: "Overlay" },
        ] as const
      ).map((opt) => {
        const active = mode === opt.id;
        return (
          <button
            key={opt.id}
            type="button"
            aria-pressed={active}
            onClick={() => setMode(opt.id)}
            className={`rounded-full border px-2.5 py-0.5 font-mono text-[9px] tracking-[0.12em] uppercase transition-colors ${
              active
                ? "border-navy/35 bg-navy/5 text-navy"
                : "border-charcoal/15 bg-white text-charcoal/45 hover:border-navy/25 hover:text-navy"
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );

  if (mode === "separate") {
    return (
      <div className="space-y-8">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="font-mono text-[10px] tracking-[0.14em] uppercase text-charcoal/40">
            Timelines
          </p>
          {modeToggle}
        </div>
        <FedDecisionTimeline
          meetings={meetings}
          now={now}
          defaultLookback={defaultLookback}
          title={FOMC_TITLE}
        />
        <FedCpiTimeline
          releases={releases}
          now={now}
          defaultLookback={defaultLookback}
        />
      </div>
    );
  }

  return (
    <OverlayTimeline
      meetings={meetings}
      releases={releases}
      now={now}
      lookback={lookback}
      setLookback={setLookback}
      modeToggle={modeToggle}
    />
  );
}

function OverlayTimeline({
  meetings,
  releases,
  now,
  lookback,
  setLookback,
  modeToggle,
}: {
  meetings: readonly FomcMeeting[];
  releases: readonly CpiRelease[];
  now: Date;
  lookback: TimelineLookback;
  setLookback: (v: TimelineLookback) => void;
  modeToggle: ReactNode;
}) {
  const fomc = useMemo(
    () => selectTimelineMeetings(now, meetings, lookback),
    [now, meetings, lookback],
  );
  const cpi = useMemo(
    () => selectTimelineCpi(now, releases, lookback),
    [now, releases, lookback],
  );

  const from = startOfLocalDay(
    new Date(Math.min(fomc.from.getTime(), cpi.from.getTime())),
  );
  const to = startOfLocalDay(
    new Date(Math.max(fomc.to.getTime(), cpi.to.getTime())),
  );

  const fomcNext = fomc.next;
  const cpiNext = cpi.next;

  const fomcDecided = fomc.points.filter(
    (m) =>
      !(fomcNext?.id === m.id && m.decision == null) && rateMid(m) != null,
  );
  const lastFunds =
    fomcDecided.length > 0
      ? rateMid(fomcDecided[fomcDecided.length - 1]!)!
      : null;

  const cpiPrinted = cpi.points.filter(
    (r) =>
      !(cpiNext?.id === r.id && r.yoyPct == null) &&
      r.yoyPct != null &&
      cpiHasPrint(r),
  );
  const lastYoy =
    cpiPrinted.length > 0 ? cpiPrinted[cpiPrinted.length - 1]!.yoyPct! : null;

  const scaleValues: number[] = [];
  for (const m of fomc.points) {
    const isNext = fomcNext?.id === m.id && m.decision == null;
    const r = isNext ? lastFunds : rateMid(m);
    if (r != null) scaleValues.push(r);
  }
  for (const r of cpi.points) {
    const isNext = cpiNext?.id === r.id && r.yoyPct == null;
    const y = isNext ? lastYoy : r.yoyPct;
    if (y != null) scaleValues.push(y);
  }

  const rangeControls = (
    <div
      role="group"
      aria-label="Overlay timeline range"
      className="flex flex-wrap items-center gap-1"
    >
      {LOOKBACK_OPTIONS.map((opt) => {
        const active = lookback === opt.id;
        return (
          <button
            key={String(opt.id)}
            type="button"
            aria-pressed={active}
            onClick={() => setLookback(opt.id)}
            className={`rounded-full border px-2 py-0.5 font-mono text-[9px] tracking-[0.12em] uppercase transition-colors ${
              active
                ? "border-navy/35 bg-navy/5 text-navy"
                : "border-charcoal/15 bg-white text-charcoal/45 hover:border-navy/25 hover:text-navy"
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );

  const shellClass =
    "overflow-hidden rounded-2xl border border-charcoal/[0.08] bg-white px-5 py-5 shadow-sm shadow-charcoal/[0.04] sm:px-6";

  if (scaleValues.length === 0) {
    return (
      <div className={shellClass}>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="font-mono text-[11px] tracking-[0.2em] uppercase text-gold">
            Policy overlay
          </p>
          <div className="flex flex-wrap items-center gap-3">
            {rangeControls}
            {modeToggle}
          </div>
        </div>
        <p className="mt-4 text-sm text-slate">
          No FOMC decisions or CPI prints in this range yet.
        </p>
      </div>
    );
  }

  const pad = { top: 28, right: 16, bottom: 36, left: 44 };
  const width = 720;
  const height = 280;
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;

  const t0 = from.getTime();
  const t1 = Math.max(to.getTime(), startOfLocalDay(now).getTime());
  const tSpan = Math.max(t1 - t0, 1);
  const spanMonths = (t1 - t0) / (1000 * 60 * 60 * 24 * 30.44);

  const minRate = Math.min(...scaleValues);
  const maxRate = Math.max(...scaleValues);
  const ratePad = 0.4;
  const yMin = Math.max(0, minRate - ratePad);
  const yMax = maxRate + ratePad;
  const ySpan = Math.max(yMax - yMin, 0.5);

  const xOf = (ymd: string) =>
    pad.left + ((parseFomcYmd(ymd).getTime() - t0) / tSpan) * innerW;
  const yOf = (rate: number) =>
    pad.top + (1 - (rate - yMin) / ySpan) * innerH;

  type FomcPt = {
    meeting: FomcMeeting;
    isNext: boolean;
    rate: number;
    x: number;
    y: number;
  };
  type CpiPt = {
    release: CpiRelease;
    isNext: boolean;
    yoy: number;
    x: number;
    y: number;
  };

  const fomcPts: FomcPt[] = fomc.points
    .map((m) => {
      const isNext = Boolean(fomcNext?.id === m.id && m.decision == null);
      const rate = isNext ? lastFunds : rateMid(m);
      if (rate == null) return null;
      return {
        meeting: m,
        isNext,
        rate,
        x: xOf(m.endDate),
        y: yOf(rate),
      };
    })
    .filter((p): p is FomcPt => p != null);

  const cpiPts: CpiPt[] = cpi.points
    .map((r) => {
      const isNext = Boolean(cpiNext?.id === r.id && r.yoyPct == null);
      const yoy = isNext ? lastYoy : r.yoyPct;
      if (yoy == null) return null;
      return {
        release: r,
        isNext,
        yoy,
        x: xOf(r.releaseDate),
        y: yOf(yoy),
      };
    })
    .filter((p): p is CpiPt => p != null);

  const stepPath = (pts: { x: number; y: number }[]) => {
    let d = "";
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i]!;
      if (i === 0) d = `M ${p.x} ${p.y}`;
      else d += ` H ${p.x} V ${p.y}`;
    }
    return d;
  };

  const todayX = Math.min(
    width - pad.right,
    Math.max(
      pad.left,
      pad.left + ((startOfLocalDay(now).getTime() - t0) / tSpan) * innerW,
    ),
  );

  const xLabels: { key: string; x: number; label: string }[] = [];
  if (spanMonths > 30) {
    let year = from.getFullYear();
    const endYear = new Date(t1).getFullYear();
    while (year <= endYear) {
      const t = new Date(year, 0, 1).getTime();
      if (t >= t0 - 1 && t <= t1) {
        xLabels.push({
          key: `y-${year}`,
          x: pad.left + ((t - t0) / tSpan) * innerW,
          label: String(year),
        });
      }
      year += 1;
    }
  } else {
    let cursor = new Date(from.getFullYear(), from.getMonth(), 1);
    if (cursor.getTime() < from.getTime()) {
      cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
    }
    const monthStep = spanMonths > 18 ? 2 : 1;
    while (cursor.getTime() <= t1) {
      const x = pad.left + ((cursor.getTime() - t0) / tSpan) * innerW;
      xLabels.push({
        key: `${cursor.getFullYear()}-${cursor.getMonth()}`,
        x,
        label: new Intl.DateTimeFormat("en-US", { month: "short" }).format(
          cursor,
        ),
      });
      cursor = new Date(
        cursor.getFullYear(),
        cursor.getMonth() + monthStep,
        1,
      );
    }
  }

  const yTicks: number[] = [];
  const step = spanMonths > 36 ? 1 : 0.5;
  const firstTick = Math.ceil(yMin / step) * step;
  for (let r = firstTick; r <= yMax + 1e-9; r += step) {
    yTicks.push(Number(r.toFixed(2)));
  }
  if (yTicks.length === 0) yTicks.push(yMin, yMax);

  const caption =
    lookback === "all"
      ? "Full history · funds mid-range + CPI-U YoY"
      : lookback === 12
        ? "Last 12 months · funds mid-range + CPI-U YoY"
        : lookback === 24
          ? "Last 2 years · funds mid-range + CPI-U YoY"
          : "Last 5 years · funds mid-range + CPI-U YoY";

  return (
    <div className={shellClass}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="min-w-0">
          <p className="font-mono text-[11px] tracking-[0.2em] uppercase text-gold">
            Policy overlay
          </p>
          <p className="mt-1 max-w-xl font-mono text-[10px] leading-snug tracking-[0.1em] uppercase text-charcoal/40">
            {FOMC_TITLE} · Prevailing CPI
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {rangeControls}
          {modeToggle}
        </div>
      </div>
      <p className="mt-1 font-mono text-[10px] tracking-[0.12em] uppercase text-charcoal/40">
        {caption}
      </p>

      <div className="mt-4 hidden md:block">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="h-auto w-full"
          role="img"
          aria-label="FOMC federal funds target and CPI YoY overlaid by date"
        >
          {yTicks.map((rate) => (
            <g key={rate}>
              <line
                x1={pad.left}
                x2={width - pad.right}
                y1={yOf(rate)}
                y2={yOf(rate)}
                stroke="currentColor"
                className="text-charcoal/10"
                strokeWidth={1}
              />
              <text
                x={pad.left - 8}
                y={yOf(rate) + 3}
                textAnchor="end"
                className="fill-charcoal/45"
                style={{ fontSize: 10, fontFamily: "ui-monospace, monospace" }}
              >
                {rate.toFixed(1)}%
              </text>
            </g>
          ))}

          <line
            x1={pad.left}
            x2={width - pad.right}
            y1={pad.top + innerH}
            y2={pad.top + innerH}
            stroke="currentColor"
            className="text-charcoal/20"
            strokeWidth={1}
          />
          <line
            x1={pad.left}
            x2={pad.left}
            y1={pad.top}
            y2={pad.top + innerH}
            stroke="currentColor"
            className="text-charcoal/20"
            strokeWidth={1}
          />

          {xLabels.map((m) => (
            <g key={m.key}>
              <line
                x1={m.x}
                x2={m.x}
                y1={pad.top + innerH}
                y2={pad.top + innerH + 4}
                stroke="currentColor"
                className="text-charcoal/25"
                strokeWidth={1}
              />
              <text
                x={m.x}
                y={height - 10}
                textAnchor="middle"
                className="fill-charcoal/40"
                style={{ fontSize: 9, fontFamily: "ui-monospace, monospace" }}
              >
                {m.label}
              </text>
            </g>
          ))}

          <line
            x1={todayX}
            x2={todayX}
            y1={pad.top}
            y2={pad.top + innerH}
            stroke="currentColor"
            className="text-gold/60"
            strokeWidth={1}
            strokeDasharray="3 3"
          />
          <text
            x={todayX}
            y={pad.top - 10}
            textAnchor="middle"
            className="fill-gold"
            style={{ fontSize: 9, fontFamily: "ui-monospace, monospace" }}
          >
            TODAY
          </text>

          {yMin < 2 && yMax > 2 ? (
            <line
              x1={pad.left}
              x2={width - pad.right}
              y1={yOf(2)}
              y2={yOf(2)}
              stroke="currentColor"
              className="text-sky/35"
              strokeWidth={1}
              strokeDasharray="4 3"
            />
          ) : null}

          {/* CPI under FOMC so decision dots stay on top */}
          {cpiPts.length > 0 ? (
            <path
              d={stepPath(cpiPts)}
              fill="none"
              stroke="currentColor"
              className="text-sky/75"
              strokeWidth={2}
              strokeLinejoin="miter"
            />
          ) : null}
          {fomcPts.length > 0 ? (
            <path
              d={stepPath(fomcPts)}
              fill="none"
              stroke="currentColor"
              className="text-navy/70"
              strokeWidth={2.25}
              strokeLinejoin="miter"
            />
          ) : null}

          {cpiPts.map((p) => (
            <g key={`cpi-${p.release.id}`}>
              <title>
                {p.isNext
                  ? `Next CPI ${p.release.releaseDate}`
                  : `CPI ${formatCpiReferenceMonth(p.release.referenceMonth)}: ${formatCpiPct(p.release.yoyPct)} YoY`}
              </title>
              <circle
                cx={p.x}
                cy={p.y}
                r={cpiPts.length > 36 ? 3 : 4.5}
                fill={p.isNext ? "var(--color-cream)" : cpiFill(p.release)}
                stroke={p.isNext ? "var(--color-gold)" : "var(--color-sky)"}
                strokeWidth={1.5}
                strokeDasharray={p.isNext ? "2 1.5" : undefined}
              />
            </g>
          ))}

          {fomcPts.map((p) => (
            <g key={`fomc-${p.meeting.id}`}>
              <title>
                {p.isNext
                  ? `Next FOMC ${p.meeting.endDate}`
                  : `${p.meeting.endDate}: ${decisionLabel(p.meeting.decision, p.meeting.basisPoints)} · ${formatFedFundsRange(p.meeting.targetRangeLow, p.meeting.targetRangeHigh)}`}
              </title>
              <circle
                cx={p.x}
                cy={p.y}
                r={fomcPts.length > 30 ? 4.5 : 6}
                fill={
                  p.isNext ? "var(--color-cream)" : decisionFill(p.meeting.decision)
                }
                stroke={p.isNext ? "var(--color-gold)" : "white"}
                strokeWidth={1.75}
                strokeDasharray={p.isNext ? "2 1.5" : undefined}
              />
            </g>
          ))}

          <text
            x={12}
            y={pad.top + innerH / 2}
            textAnchor="middle"
            transform={`rotate(-90 12 ${pad.top + innerH / 2})`}
            className="fill-charcoal/40"
            style={{ fontSize: 9, fontFamily: "ui-monospace, monospace" }}
          >
            PERCENT
          </text>
        </svg>

        <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1.5 font-mono text-[10px] tracking-[0.12em] uppercase text-charcoal/45">
          <li className="inline-flex items-center gap-1.5">
            <span className="h-0.5 w-3 bg-navy/70" aria-hidden /> Funds rate
          </li>
          <li className="inline-flex items-center gap-1.5">
            <span className="h-0.5 w-3 bg-sky/75" aria-hidden /> CPI YoY
          </li>
          <li className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-sage" aria-hidden /> Cut
          </li>
          <li className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-navy" aria-hidden /> Hold
          </li>
          <li className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-coral" aria-hidden /> Hike
          </li>
          <li className="inline-flex items-center gap-1.5 text-sky/70">
            Dashed · 2% CPI guide
          </li>
        </ul>
      </div>

      {/* Mobile: stacked recent events from both series */}
      <ol className="mt-5 space-y-0 md:hidden">
        {[
          ...fomcPts.map((p) => ({
            key: `f-${p.meeting.id}`,
            t: parseFomcYmd(p.meeting.endDate).getTime(),
            kind: "fomc" as const,
            p,
          })),
          ...cpiPts.map((p) => ({
            key: `c-${p.release.id}`,
            t: parseFomcYmd(p.release.releaseDate).getTime(),
            kind: "cpi" as const,
            p,
          })),
        ]
          .sort((a, b) => b.t - a.t)
          .map((row, i, rows) => {
            if (row.kind === "fomc") {
              const p = row.p;
              return (
                <li key={row.key} className="flex gap-3">
                  <div className="flex w-4 flex-col items-center">
                    <span
                      className={`mt-1 h-3 w-3 shrink-0 rounded-full border-2 border-white ${
                        p.isNext ? "border-dashed border-gold bg-cream" : ""
                      }`}
                      style={{
                        backgroundColor: p.isNext
                          ? undefined
                          : decisionFill(p.meeting.decision),
                      }}
                      aria-hidden
                    />
                    {i < rows.length - 1 ? (
                      <span
                        className="mt-1 w-px flex-1 bg-charcoal/15"
                        aria-hidden
                      />
                    ) : null}
                  </div>
                  <div
                    className={`min-w-0 pb-5 ${i === rows.length - 1 ? "pb-0" : ""}`}
                  >
                    <p className="font-mono text-[10px] tracking-[0.1em] uppercase text-charcoal/45">
                      FOMC ·{" "}
                      {formatFomcDayWithWeekday(p.meeting.endDate, {
                        month: "short",
                        year: true,
                      })}
                    </p>
                    <p className="mt-0.5 font-mono text-[12px] tracking-[0.08em] uppercase text-navy">
                      {p.isNext
                        ? "Next meeting"
                        : decisionLabel(
                            p.meeting.decision,
                            p.meeting.basisPoints,
                          )}
                    </p>
                    <p className="mt-0.5 font-mono text-[12px] tabular-nums text-navy">
                      {p.isNext
                        ? lastFunds != null
                          ? `At ${lastFunds.toFixed(2)}% (pending)`
                          : "Decision pending"
                        : formatFedFundsRange(
                            p.meeting.targetRangeLow,
                            p.meeting.targetRangeHigh,
                          )}
                    </p>
                  </div>
                </li>
              );
            }
            const p = row.p;
            return (
              <li key={row.key} className="flex gap-3">
                <div className="flex w-4 flex-col items-center">
                  <span
                    className={`mt-1 h-3 w-3 shrink-0 rounded-full border-2 ${
                      p.isNext
                        ? "border-dashed border-gold bg-cream"
                        : "border-sky"
                    }`}
                    style={{
                      backgroundColor: p.isNext
                        ? undefined
                        : cpiFill(p.release),
                    }}
                    aria-hidden
                  />
                  {i < rows.length - 1 ? (
                    <span
                      className="mt-1 w-px flex-1 bg-charcoal/15"
                      aria-hidden
                    />
                  ) : null}
                </div>
                <div
                  className={`min-w-0 pb-5 ${i === rows.length - 1 ? "pb-0" : ""}`}
                >
                  <p className="font-mono text-[10px] tracking-[0.1em] uppercase text-charcoal/45">
                    CPI ·{" "}
                    {formatFomcDayWithWeekday(p.release.releaseDate, {
                      month: "short",
                      year: true,
                    })}
                  </p>
                  <p className="mt-0.5 font-mono text-[12px] tracking-[0.08em] uppercase text-sky">
                    {p.isNext
                      ? "Next release"
                      : formatCpiReferenceMonth(p.release.referenceMonth)}
                  </p>
                  <p className="mt-0.5 font-mono text-[12px] tabular-nums text-navy">
                    {p.isNext
                      ? lastYoy != null
                        ? `At ${formatCpiPct(lastYoy)} YoY (pending)`
                        : "Print pending"
                      : `${formatCpiPct(p.release.yoyPct)} YoY`}
                  </p>
                </div>
              </li>
            );
          })}
      </ol>
    </div>
  );
}
