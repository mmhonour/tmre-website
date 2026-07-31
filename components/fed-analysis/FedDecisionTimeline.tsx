import {
  decisionLabel,
  formatFedFundsRange,
  formatFomcDayWithWeekday,
  getNextFomcMeeting,
  parseFomcYmd,
  type FomcMeeting,
} from "@/lib/fed-fomc-calendar";

function startOfLocalDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}

function monthsAgo(now: Date, months: number): Date {
  return startOfLocalDay(
    new Date(now.getFullYear(), now.getMonth() - months, now.getDate()),
  );
}

function decisionTone(decision: FomcMeeting["decision"]): {
  dot: string;
  label: string;
  fill: string;
} {
  if (decision === "cut") {
    return {
      dot: "bg-sage border-sage",
      label: "text-sage",
      fill: "var(--color-sage)",
    };
  }
  if (decision === "hike") {
    return {
      dot: "bg-coral border-coral",
      label: "text-coral",
      fill: "var(--color-coral)",
    };
  }
  if (decision === "hold") {
    return {
      dot: "bg-navy border-navy",
      label: "text-navy",
      fill: "var(--color-navy)",
    };
  }
  return {
    dot: "bg-gold border-gold",
    label: "text-navy",
    fill: "var(--color-gold)",
  };
}

function rateMid(m: FomcMeeting): number | null {
  if (m.targetRangeLow == null || m.targetRangeHigh == null) return null;
  return (m.targetRangeLow + m.targetRangeHigh) / 2;
}

export function selectTimelineMeetings(
  now: Date,
  meetings: readonly FomcMeeting[],
): { points: FomcMeeting[]; next: FomcMeeting | null; from: Date; to: Date } {
  const from = monthsAgo(now, 12);
  const next = getNextFomcMeeting(now, meetings);
  const past = meetings
    .filter((m) => {
      const end = parseFomcYmd(m.endDate);
      return (
        end.getTime() >= from.getTime() &&
        end.getTime() <= now.getTime() &&
        m.decision != null &&
        rateMid(m) != null
      );
    })
    .sort(
      (a, b) =>
        parseFomcYmd(a.endDate).getTime() - parseFomcYmd(b.endDate).getTime(),
    );

  const points =
    next && !past.some((m) => m.id === next.id) ? [...past, next] : [...past];

  const lastPoint = points[points.length - 1];
  const to = lastPoint
    ? parseFomcYmd(lastPoint.endDate)
    : new Date(now.getFullYear(), now.getMonth() + 2, now.getDate());

  return { points, next, from, to: startOfLocalDay(to) };
}

type PlotPoint = {
  meeting: FomcMeeting;
  isNext: boolean;
  /** Rate level used for Y (mid of range; next uses last decided mid). */
  rate: number;
  x: number;
  y: number;
};

export default function FedDecisionTimeline({
  meetings,
  now = new Date(),
}: {
  meetings: readonly FomcMeeting[];
  now?: Date;
}) {
  const { points, next, from, to } = selectTimelineMeetings(now, meetings);

  const decidedWithRate = points.filter(
    (m) => !(next?.id === m.id && m.decision == null) && rateMid(m) != null,
  );
  const lastDecidedRate =
    decidedWithRate.length > 0
      ? rateMid(decidedWithRate[decidedWithRate.length - 1]!)!
      : null;

  const ratesForScale = points
    .map((m) => {
      const isNext = next?.id === m.id && m.decision == null;
      if (isNext) return lastDecidedRate;
      return rateMid(m);
    })
    .filter((r): r is number => r != null);

  if (points.length === 0 || ratesForScale.length === 0) {
    return (
      <div className="overflow-hidden rounded-2xl border border-charcoal/[0.08] bg-white px-5 py-5 shadow-sm shadow-charcoal/[0.04] sm:px-6">
        <p className="font-mono text-[11px] tracking-[0.2em] uppercase text-gold">
          Decision timeline
        </p>
        <p className="mt-4 text-sm text-slate">
          No decided meetings in the last 12 months yet.
        </p>
      </div>
    );
  }

  const pad = { top: 28, right: 16, bottom: 36, left: 44 };
  const width = 720;
  const height = 260;
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;

  const t0 = from.getTime();
  const t1 = Math.max(to.getTime(), startOfLocalDay(now).getTime());
  const tSpan = Math.max(t1 - t0, 1);

  const minRate = Math.min(...ratesForScale);
  const maxRate = Math.max(...ratesForScale);
  const ratePad = 0.35;
  const yMin = Math.max(0, minRate - ratePad);
  const yMax = maxRate + ratePad;
  const ySpan = Math.max(yMax - yMin, 0.5);

  const xOf = (ymd: string) =>
    pad.left + ((parseFomcYmd(ymd).getTime() - t0) / tSpan) * innerW;
  const yOf = (rate: number) =>
    pad.top + (1 - (rate - yMin) / ySpan) * innerH;

  const plotPoints: PlotPoint[] = points
    .map((m) => {
      const isNext = Boolean(next?.id === m.id && m.decision == null);
      const rate = isNext ? lastDecidedRate : rateMid(m);
      if (rate == null) return null;
      return {
        meeting: m,
        isNext,
        rate,
        x: xOf(m.endDate),
        y: yOf(rate),
      };
    })
    .filter((p): p is PlotPoint => p != null);

  // Step path: hold level until next decision day, then jump.
  let stepPath = "";
  for (let i = 0; i < plotPoints.length; i++) {
    const p = plotPoints[i]!;
    if (i === 0) {
      stepPath = `M ${p.x} ${p.y}`;
    } else {
      stepPath += ` H ${p.x} V ${p.y}`;
    }
  }

  const todayX = Math.min(
    width - pad.right,
    Math.max(
      pad.left,
      pad.left +
        ((startOfLocalDay(now).getTime() - t0) / tSpan) * innerW,
    ),
  );

  // Month ticks on X
  const monthLabels: { key: string; x: number; label: string }[] = [];
  let cursor = new Date(from.getFullYear(), from.getMonth(), 1);
  if (cursor.getTime() < from.getTime()) {
    cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
  }
  while (cursor.getTime() <= t1) {
    const x =
      pad.left + ((cursor.getTime() - t0) / tSpan) * innerW;
    monthLabels.push({
      key: `${cursor.getFullYear()}-${cursor.getMonth()}`,
      x,
      label: new Intl.DateTimeFormat("en-US", { month: "short" }).format(
        cursor,
      ),
    });
    cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
  }

  // Y ticks at ~0.5% steps across the visible range
  const yTicks: number[] = [];
  const step = 0.5;
  const firstTick = Math.ceil(yMin / step) * step;
  for (let r = firstTick; r <= yMax + 1e-9; r += step) {
    yTicks.push(Number(r.toFixed(2)));
  }
  if (yTicks.length === 0) yTicks.push(yMin, yMax);

  return (
    <div className="overflow-hidden rounded-2xl border border-charcoal/[0.08] bg-white px-5 py-5 shadow-sm shadow-charcoal/[0.04] sm:px-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-mono text-[11px] tracking-[0.2em] uppercase text-gold">
          Decision timeline
        </p>
        <p className="font-mono text-[10px] tracking-[0.12em] uppercase text-charcoal/40">
          Last 12 months + next · mid of funds range
        </p>
      </div>

      {/* Desktop / tablet: rate × time */}
      <div className="mt-4 hidden md:block">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="w-full h-auto"
          role="img"
          aria-label="FOMC decisions plotted by date and federal funds target rate"
        >
          {/* Y grid + labels */}
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

          {/* X axis */}
          <line
            x1={pad.left}
            x2={width - pad.right}
            y1={pad.top + innerH}
            y2={pad.top + innerH}
            stroke="currentColor"
            className="text-charcoal/20"
            strokeWidth={1}
          />
          {/* Y axis */}
          <line
            x1={pad.left}
            x2={pad.left}
            y1={pad.top}
            y2={pad.top + innerH}
            stroke="currentColor"
            className="text-charcoal/20"
            strokeWidth={1}
          />

          {monthLabels.map((m) => (
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

          {/* Today */}
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

          {/* Step through rate levels */}
          <path
            d={stepPath}
            fill="none"
            stroke="currentColor"
            className="text-navy/55"
            strokeWidth={2}
            strokeLinejoin="miter"
          />

          {plotPoints.map((p, i) => {
            const tone = decisionTone(p.meeting.decision);
            const labelAbove = i % 2 === 0;
            return (
              <g key={p.meeting.id}>
                <title>
                  {p.isNext
                    ? `Next FOMC ${p.meeting.endDate}`
                    : `${p.meeting.endDate}: ${decisionLabel(p.meeting.decision, p.meeting.basisPoints)} · ${formatFedFundsRange(p.meeting.targetRangeLow, p.meeting.targetRangeHigh)}`}
                </title>
                <circle
                  cx={p.x}
                  cy={p.y}
                  r={6}
                  fill={p.isNext ? "var(--color-cream)" : tone.fill}
                  stroke={p.isNext ? "var(--color-gold)" : "white"}
                  strokeWidth={p.isNext ? 1.5 : 1.5}
                  strokeDasharray={p.isNext ? "2 1.5" : undefined}
                />
                <text
                  x={p.x}
                  y={labelAbove ? p.y - 14 : p.y + 20}
                  textAnchor="middle"
                  className="fill-charcoal/50"
                  style={{ fontSize: 9, fontFamily: "ui-monospace, monospace" }}
                >
                  {formatFomcDayWithWeekday(p.meeting.endDate, {
                    month: "short",
                    year: false,
                  }).replace(/,.*/, "")}
                </text>
                <text
                  x={p.x}
                  y={labelAbove ? p.y - 26 : p.y + 32}
                  textAnchor="middle"
                  fill={p.isNext ? "var(--color-gold)" : tone.fill}
                  style={{
                    fontSize: 10,
                    fontFamily: "ui-monospace, monospace",
                    fontWeight: 600,
                  }}
                >
                  {p.isNext
                    ? "Next"
                    : decisionLabel(p.meeting.decision, p.meeting.basisPoints)}
                </text>
              </g>
            );
          })}

          <text
            x={12}
            y={pad.top + innerH / 2}
            textAnchor="middle"
            transform={`rotate(-90 12 ${pad.top + innerH / 2})`}
            className="fill-charcoal/40"
            style={{ fontSize: 9, fontFamily: "ui-monospace, monospace" }}
          >
            FUNDS RATE
          </text>
        </svg>

        <ul className="mt-2 flex flex-wrap gap-4 font-mono text-[10px] tracking-[0.12em] uppercase text-charcoal/45">
          <li className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-sage" aria-hidden /> Cut
          </li>
          <li className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-navy" aria-hidden /> Hold
          </li>
          <li className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-coral" aria-hidden /> Hike
          </li>
          <li className="inline-flex items-center gap-1.5">
            <span
              className="h-2 w-2 rounded-full border border-dashed border-gold bg-cream"
              aria-hidden
            />{" "}
            Next
          </li>
        </ul>
      </div>

      {/* Mobile: newest first (desktop chart stays chronological L→R) */}
      <ol className="mt-5 space-y-0 md:hidden">
        {[...plotPoints].reverse().map((p, i, rows) => {
          const tone = decisionTone(p.meeting.decision);
          return (
            <li key={p.meeting.id} className="flex gap-3">
              <div className="flex w-4 flex-col items-center">
                <span
                  className={`mt-1 h-3 w-3 shrink-0 rounded-full border-2 ${
                    p.isNext
                      ? "border-dashed border-gold bg-cream"
                      : tone.dot
                  }`}
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
                  {formatFomcDayWithWeekday(p.meeting.endDate, {
                    month: "short",
                  })}
                </p>
                <p
                  className={`mt-0.5 font-mono text-[12px] tracking-[0.08em] uppercase ${
                    p.isNext ? "text-gold" : tone.label
                  }`}
                >
                  {p.isNext
                    ? "Next meeting"
                    : decisionLabel(
                        p.meeting.decision,
                        p.meeting.basisPoints,
                      )}
                </p>
                <p className="mt-0.5 font-mono text-[12px] tabular-nums text-navy">
                  {p.isNext
                    ? lastDecidedRate != null
                      ? `At ${lastDecidedRate.toFixed(2)}% (pending)`
                      : "Decision pending"
                    : formatFedFundsRange(
                        p.meeting.targetRangeLow,
                        p.meeting.targetRangeHigh,
                      )}
                </p>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
