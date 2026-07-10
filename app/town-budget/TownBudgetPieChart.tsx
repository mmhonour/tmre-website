"use client";

import { useMemo } from "react";
import {
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import type { BudgetLineItem } from "@/lib/town-budget";

const PIE_COLORS = [
  "#1B2A4A",
  "#C8A951",
  "#4A7C6F",
  "#4A8DB7",
  "#C85A3A",
  "#2A3D6B",
  "#D8BC6E",
  "#5A5A56",
  "#131F38",
  "#6B9E8F",
  "#7BAFD4",
];

type PieRow = BudgetLineItem & { color: string };

function toPieRows(items: BudgetLineItem[]): PieRow[] {
  return items.map((item, i) => ({
    ...item,
    color: PIE_COLORS[i % PIE_COLORS.length],
  }));
}

function PieTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { payload: PieRow }[];
}) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  return (
    <div className="rounded-lg border border-charcoal/10 bg-white px-3 py-2 shadow-lg shadow-navy/10">
      <p className="font-mono text-[10px] uppercase tracking-wider text-slate mb-1">
        {row.label}
      </p>
      <p className="font-mono text-sm text-navy tabular-nums">
        {row.sharePct.toFixed(2)}%
      </p>
    </div>
  );
}

export default function TownBudgetPieChart({
  title,
  items,
  compact = false,
}: {
  title: string;
  items: BudgetLineItem[];
  compact?: boolean;
}) {
  const rows = useMemo(() => toPieRows(items), [items]);
  const height = compact ? 260 : 320;

  return (
    <div className="rounded-2xl bg-white border border-charcoal/[0.08] overflow-hidden">
      <div className="px-5 py-4 border-b border-charcoal/[0.08] bg-cream/60">
        <p className="font-mono text-[10px] tracking-[0.2em] uppercase text-slate">
          {title}
        </p>
      </div>
      <div className="px-4 py-5">
        <div style={{ height }} className="w-full">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={rows}
                dataKey="sharePct"
                nameKey="label"
                cx="50%"
                cy="50%"
                innerRadius={compact ? 52 : 68}
                outerRadius={compact ? 96 : 118}
                paddingAngle={1.5}
                stroke="var(--color-cream)"
                strokeWidth={2}
              >
                {rows.map((row) => (
                  <Cell key={row.id} fill={row.color} />
                ))}
              </Pie>
              <Tooltip content={<PieTooltip />} />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <ul className="mt-2 space-y-2">
          {rows.map((row) => (
            <li key={row.id} className="flex items-start gap-2.5 text-sm">
              <span
                className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: row.color }}
                aria-hidden
              />
              <span className="flex-1 text-charcoal/80 leading-snug">{row.label}</span>
              <span className="font-mono text-[11px] text-navy tabular-nums shrink-0">
                {row.sharePct.toFixed(2)}%
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
