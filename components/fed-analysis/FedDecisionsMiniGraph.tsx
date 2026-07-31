import {
  decisionLabel,
  formatFedFundsRange,
  parseFomcYmd,
  type FomcMeeting,
} from "@/lib/fed-fomc-calendar";

type Point = {
  id: string;
  endDate: string;
  mid: number;
  low: number;
  high: number;
  decision: FomcMeeting["decision"];
  label: string;
  rangeLabel: string;
};

function decisionColor(decision: FomcMeeting["decision"]): string {
  if (decision === "cut") return "var(--color-sage, #5B7F6A)";
  if (decision === "hike") return "var(--color-coral, #C46B5A)";
  if (decision === "hold") return "var(--color-navy, #1B2A4A)";
  return "var(--color-gold, #C4A35A)";
}

/**
 * Compact step chart of the federal funds target range over recent decisions
 * (up to ~24 months of decided meetings).
 */
export default function FedDecisionsMiniGraph({
  meetings,
  now = new Date(),
  months = 24,
}: {
  meetings: readonly FomcMeeting[];
  now?: Date;
  months?: number;
}) {
  const from = new Date(
    now.getFullYear(),
    now.getMonth() - months,
    now.getDate(),
  );

  const points: Point[] = meetings
    .filter(
      (m) =>
        m.decision != null &&
        m.targetRangeLow != null &&
        m.targetRangeHigh != null &&
        parseFomcYmd(m.endDate).getTime() >= from.getTime() &&
        parseFomcYmd(m.endDate).getTime() <= now.getTime(),
    )
    .sort(
      (a, b) =>
        parseFomcYmd(a.endDate).getTime() - parseFomcYmd(b.endDate).getTime(),
    )
    .map((m) => {
      const low = m.targetRangeLow!;
      const high = m.targetRangeHigh!;
      return {
        id: m.id,
        endDate: m.endDate,
        low,
        high,
        mid: (low + high) / 2,
        decision: m.decision,
        label: decisionLabel(m.decision, m.basisPoints),
        rangeLabel: formatFedFundsRange(low, high),
      };
    });

  if (points.length === 0) {
    return (
      <div className="rounded-2xl border border-charcoal/[0.08] bg-white px-5 py-5 shadow-sm shadow-charcoal/[0.04] sm:px-6">
        <p className="font-mono text-[11px] tracking-[0.2em] uppercase text-gold">
          Target range
        </p>
        <p className="mt-3 text-sm text-slate">
          No decided meetings in the last {months} months to plot yet.
        </p>
      </div>
    );
  }

  const pad = { top: 16, right: 12, bottom: 28, left: 36 };
  const width = 560;
  const height = 200;
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;

  const minRate = Math.min(...points.map((p) => p.low));
  const maxRate = Math.max(...points.map((p) => p.high));
  const ratePad = 0.25;
  const yMin = Math.max(0, minRate - ratePad);
  const yMax = maxRate + ratePad;
  const ySpan = Math.max(yMax - yMin, 0.5);

  const t0 = parseFomcYmd(points[0]!.endDate).getTime();
  const t1 = parseFomcYmd(points[points.length - 1]!.endDate).getTime();
  const tSpan = Math.max(t1 - t0, 1);

  const xOf = (ymd: string) =>
    pad.left + ((parseFomcYmd(ymd).getTime() - t0) / tSpan) * innerW;
  const yOf = (rate: number) =>
    pad.top + (1 - (rate - yMin) / ySpan) * innerH;

  // Step path through midpoints (hold level, then jump on decision day).
  let path = "";
  for (let i = 0; i < points.length; i++) {
    const p = points[i]!;
    const x = xOf(p.endDate);
    const y = yOf(p.mid);
    if (i === 0) {
      path = `M ${x} ${y}`;
    } else {
      path += ` H ${x} V ${y}`;
    }
  }

  const yTicks = [yMin, (yMin + yMax) / 2, yMax];

  return (
    <div className="rounded-2xl border border-charcoal/[0.08] bg-white px-5 py-5 shadow-sm shadow-charcoal/[0.04] sm:px-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-mono text-[11px] tracking-[0.2em] uppercase text-gold">
          Target range
        </p>
        <p className="font-mono text-[10px] tracking-[0.12em] uppercase text-charcoal/40">
          Last {months} months · mid of funds range
        </p>
      </div>

      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="mt-3 w-full h-auto"
        role="img"
        aria-label="Federal funds target range over recent FOMC decisions"
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
              x={pad.left - 6}
              y={yOf(rate) + 3}
              textAnchor="end"
              className="fill-charcoal/40"
              style={{ fontSize: 10, fontFamily: "ui-monospace, monospace" }}
            >
              {rate.toFixed(1)}%
            </text>
          </g>
        ))}

        <path
          d={path}
          fill="none"
          stroke="currentColor"
          className="text-navy/70"
          strokeWidth={2}
          strokeLinejoin="miter"
        />

        {points.map((p) => (
          <g key={p.id}>
            <title>{`${p.endDate}: ${p.label} · ${p.rangeLabel}`}</title>
            <circle
              cx={xOf(p.endDate)}
              cy={yOf(p.mid)}
              r={5}
              fill={decisionColor(p.decision)}
              stroke="white"
              strokeWidth={1.5}
            />
          </g>
        ))}

        <text
          x={pad.left}
          y={height - 8}
          className="fill-charcoal/40"
          style={{ fontSize: 10, fontFamily: "ui-monospace, monospace" }}
        >
          {points[0]!.endDate.slice(0, 7)}
        </text>
        <text
          x={width - pad.right}
          y={height - 8}
          textAnchor="end"
          className="fill-charcoal/40"
          style={{ fontSize: 10, fontFamily: "ui-monospace, monospace" }}
        >
          {points[points.length - 1]!.endDate.slice(0, 7)}
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
      </ul>
    </div>
  );
}
