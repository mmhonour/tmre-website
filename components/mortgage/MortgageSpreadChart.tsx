"use client";

import { useMemo, useState } from "react";
import {
  formatRatePct,
  type MortgageObservation,
} from "@/lib/mortgage-rates-shared";

type Line = {
  id: string;
  label: string;
  color: string;
  observations: MortgageObservation[];
};

const WIDTH = 960;
const HEIGHT = 320;
const PAD = { top: 18, right: 16, bottom: 30, left: 44 };

function niceBounds(values: number[]): { min: number; max: number } {
  if (values.length === 0) return { min: 0, max: 1 };
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  if (hi === lo) return { min: lo - 0.5, max: hi + 0.5 };
  const pad = (hi - lo) * 0.12;
  return {
    min: Math.floor((lo - pad) * 2) / 2,
    max: Math.ceil((hi + pad) * 2) / 2,
  };
}

/**
 * Jumbo vs conforming 30-year fixed, five years of daily locks.
 * Pure SVG so it renders without a chart dependency.
 */
export default function MortgageSpreadChart({
  lines,
  caption,
}: {
  lines: Line[];
  caption?: string;
}) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const model = useMemo(() => {
    const dates = new Set<string>();
    for (const line of lines) {
      for (const obs of line.observations) dates.add(obs.date);
    }
    const axis = Array.from(dates).sort();
    const axisIndex = new Map(axis.map((date, i) => [date, i]));
    const values = lines.flatMap((line) =>
      line.observations.map((obs) => obs.value),
    );
    const { min, max } = niceBounds(values);

    const xFor = (date: string) => {
      const i = axisIndex.get(date) ?? 0;
      const span = Math.max(axis.length - 1, 1);
      return (
        PAD.left + (i / span) * (WIDTH - PAD.left - PAD.right)
      );
    };
    const yFor = (value: number) =>
      PAD.top +
      (1 - (value - min) / (max - min || 1)) * (HEIGHT - PAD.top - PAD.bottom);

    const paths = lines.map((line) => ({
      ...line,
      d: line.observations
        .map(
          (obs, i) =>
            `${i === 0 ? "M" : "L"}${xFor(obs.date).toFixed(1)},${yFor(obs.value).toFixed(1)}`,
        )
        .join(" "),
      latest: line.observations[line.observations.length - 1] ?? null,
    }));

    const ticks: number[] = [];
    const step = (max - min) / 4;
    for (let i = 0; i <= 4; i += 1) ticks.push(min + step * i);

    // One label per calendar year, at the first observation of that year.
    const yearMarks: { date: string; label: string }[] = [];
    let lastYear = "";
    for (const date of axis) {
      const year = date.slice(0, 4);
      if (year !== lastYear) {
        yearMarks.push({ date, label: year });
        lastYear = year;
      }
    }

    return { axis, min, max, xFor, yFor, paths, ticks, yearMarks };
  }, [lines]);

  if (model.axis.length === 0) {
    return (
      <div className="rounded-xl border border-charcoal/[0.08] bg-cream/40 px-5 py-10 text-center">
        <p className="text-sm text-charcoal/60">
          No rate history stored yet — run Admin → Data controls → Site controls
          → Mortgage page → Refresh rates from FRED.
        </p>
      </div>
    );
  }

  const hoverDate =
    hoverIdx != null ? model.axis[Math.min(hoverIdx, model.axis.length - 1)] : null;

  return (
    <figure className="space-y-3">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        {model.paths.map((line) => (
          <span key={line.id} className="inline-flex items-center gap-2">
            <span
              className="inline-block h-0.5 w-5 rounded"
              style={{ backgroundColor: line.color }}
              aria-hidden
            />
            <span className="font-mono text-[10px] tracking-[0.12em] uppercase text-charcoal/60">
              {line.label}
            </span>
            <span className="font-mono text-xs tabular-nums text-navy">
              {formatRatePct(line.latest?.value ?? null)}
            </span>
          </span>
        ))}
      </div>

      <div className="overflow-hidden rounded-xl border border-charcoal/[0.08] bg-white">
        <svg
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          className="h-auto w-full"
          role="img"
          aria-label="30-year jumbo and conforming mortgage rates over the last five years"
          onMouseLeave={() => setHoverIdx(null)}
          onMouseMove={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const ratio = (e.clientX - rect.left) / rect.width;
            const x = ratio * WIDTH;
            const inner = WIDTH - PAD.left - PAD.right;
            const t = Math.min(Math.max((x - PAD.left) / inner, 0), 1);
            setHoverIdx(Math.round(t * (model.axis.length - 1)));
          }}
        >
          {model.ticks.map((tick) => (
            <g key={tick}>
              <line
                x1={PAD.left}
                x2={WIDTH - PAD.right}
                y1={model.yFor(tick)}
                y2={model.yFor(tick)}
                stroke="currentColor"
                className="text-charcoal/10"
                strokeWidth={1}
              />
              <text
                x={PAD.left - 8}
                y={model.yFor(tick) + 3}
                textAnchor="end"
                className="fill-charcoal/45 font-mono"
                fontSize={9}
              >
                {tick.toFixed(1)}
              </text>
            </g>
          ))}

          {model.yearMarks.map((mark) => (
            <text
              key={mark.date}
              x={model.xFor(mark.date)}
              y={HEIGHT - PAD.bottom + 16}
              textAnchor="middle"
              className="fill-charcoal/45 font-mono"
              fontSize={9}
            >
              {mark.label}
            </text>
          ))}

          {model.paths.map((line) => (
            <path
              key={line.id}
              d={line.d}
              fill="none"
              stroke={line.color}
              strokeWidth={1.75}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          ))}

          {hoverDate ? (
            <line
              x1={model.xFor(hoverDate)}
              x2={model.xFor(hoverDate)}
              y1={PAD.top}
              y2={HEIGHT - PAD.bottom}
              stroke="currentColor"
              className="text-navy/30"
              strokeWidth={1}
              strokeDasharray="3 3"
            />
          ) : null}
        </svg>
      </div>

      {hoverDate ? (
        <p className="font-mono text-[10px] text-charcoal/55">
          {hoverDate}
          {lines.map((line) => {
            const hit = line.observations.find((o) => o.date === hoverDate);
            return hit
              ? ` · ${line.label} ${formatRatePct(hit.value)}`
              : "";
          })}
        </p>
      ) : caption ? (
        <figcaption className="text-xs text-charcoal/55">{caption}</figcaption>
      ) : null}
    </figure>
  );
}
