"use client";

import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  TOWN_BUDGET_TOWNS,
  formatBudgetCurrency,
  formatBudgetMillRate,
  getAllTownBudgetSnapshots,
  getAvailableBudgetFiscalYears,
  type TownBudgetTown,
} from "@/lib/town-budget";
import {
  StatsChartDataTable,
  StatsChartDataTd,
  StatsChartDataTh,
  StatsChartDataRow,
} from "@/app/stats/StatsChartDataTable";

// Connecticut statute: property is assessed at 70% of fair market value, so tax
// on a home worth `marketValue` = millRate × (marketValue × 0.70) / 1000.
const ASSESSMENT_RATIO = 0.7;
const VALUATIONS = [1, 2, 3, 4, 5].map((m) => m * 1_000_000);

// Deterministic per-town colors (matches the pie palette ordering).
const TOWN_COLORS = ["#1B2A4A", "#C8A951", "#4A7C6F", "#4A8DB7", "#C85A3A"];

function townColor(index: number): string {
  return TOWN_COLORS[index % TOWN_COLORS.length];
}

function annualTax(marketValue: number, millRate: number): number {
  return ((marketValue * ASSESSMENT_RATIO) / 1000) * millRate;
}

function valuationLabel(marketValue: number): string {
  return `$${(marketValue / 1_000_000).toFixed(0)}M`;
}

function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { name: string; value: number; color: string }[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-charcoal/10 bg-white px-3 py-2 shadow-lg shadow-navy/10">
      <p className="font-mono text-[10px] uppercase tracking-wider text-slate mb-1.5">
        {label} valuation
      </p>
      <ul className="space-y-1">
        {payload.map((row) => (
          <li key={row.name} className="flex items-center gap-2 text-xs">
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: row.color }}
              aria-hidden
            />
            <span className="text-charcoal/80">{row.name}</span>
            <span className="ml-auto font-mono text-navy tabular-nums">
              {formatBudgetCurrency(row.value)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function TownMillRateCompare() {
  const allTowns = useMemo(
    () =>
      getAllTownBudgetSnapshots().map((budget) => {
        const i = TOWN_BUDGET_TOWNS.indexOf(budget.town as TownBudgetTown);
        return {
          name: budget.town,
          color: townColor(i >= 0 ? i : 0),
          millRate: budget.millRate.current,
          fiscalYear: budget.fiscalYear,
        };
      }),
    [],
  );

  const availableYears = useMemo(
    () => getAvailableBudgetFiscalYears(),
    [],
  );

  const [year, setYear] = useState<string>(availableYears[0] ?? "");

  const towns = useMemo(
    () => allTowns.filter((t) => t.fiscalYear === year),
    [allTowns, year],
  );

  const chartData = useMemo(
    () =>
      VALUATIONS.map((value) => {
        const row: Record<string, number | string> = {
          label: valuationLabel(value),
        };
        for (const t of towns) row[t.name] = Math.round(annualTax(value, t.millRate));
        return row;
      }),
    [towns],
  );

  return (
    <div className="space-y-10">
      {/* Heading + year filter */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="font-serif text-2xl text-navy mb-1">
            Compare cost of living
          </h2>
          <p className="text-sm text-charcoal/70 max-w-xl">
            FY {year} mill rates side by side, and what they cost a homeowner at
            market valuations from $1M to $5M.
          </p>
        </div>
        <label className="flex items-center gap-2">
          <span className="font-mono text-[10px] tracking-[0.15em] uppercase text-slate">
            Fiscal year
          </span>
          <select
            value={year}
            onChange={(e) => setYear(e.target.value)}
            className="rounded-full border border-charcoal/15 bg-white px-3 py-1.5 font-mono text-[11px] text-navy focus:border-gold/50 focus:outline-none"
          >
            {availableYears.map((y) => (
              <option key={y} value={y}>
                FY {y}
              </option>
            ))}
          </select>
        </label>
      </div>

      {/* 1st — Mill rate summary panels */}
      <div
        className="grid gap-4"
        style={{
          gridTemplateColumns: `repeat(${Math.min(Math.max(towns.length, 1), 3)}, minmax(0, 1fr))`,
        }}
      >
        {towns.map((t) => (
          <div
            key={t.name}
            className="rounded-2xl bg-white border border-charcoal/[0.08] px-5 py-4"
          >
            <div className="flex items-center gap-2 mb-2">
              <span
                className="h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: t.color }}
                aria-hidden
              />
              <p className="font-mono text-[10px] tracking-[0.15em] uppercase text-slate">
                {t.name}
              </p>
            </div>
            <p className="font-serif text-3xl text-navy tabular-nums">
              {formatBudgetMillRate(t.millRate)}
              <span className="ml-2 font-mono text-[10px] tracking-[0.15em] uppercase text-slate align-middle">
                Mill Rate
              </span>
            </p>
            <p className="mt-1.5 text-xs text-charcoal/60 leading-snug">
              {formatBudgetCurrency(annualTax(1_000_000, t.millRate))} / yr on a $1M home
            </p>
          </div>
        ))}
      </div>

      {/* 2nd — Estimated annual tax table */}
      <StatsChartDataTable
        title="Estimated annual tax"
        subtitle="Connecticut statutory 70% assessment ratio · market valuation"
      >
        <thead>
          <StatsChartDataRow>
            <StatsChartDataTh>Assessed market value</StatsChartDataTh>
            {towns.map((t) => (
              <StatsChartDataTh key={t.name} align="right">
                {t.name}
              </StatsChartDataTh>
            ))}
          </StatsChartDataRow>
        </thead>
        <tbody>
          {VALUATIONS.map((value, i) => (
            <StatsChartDataRow key={value} stripe={i % 2 === 1}>
              <StatsChartDataTd>{valuationLabel(value)}</StatsChartDataTd>
              {towns.map((t) => (
                <StatsChartDataTd key={t.name} align="right">
                  {formatBudgetCurrency(annualTax(value, t.millRate))}
                </StatsChartDataTd>
              ))}
            </StatsChartDataRow>
          ))}
        </tbody>
      </StatsChartDataTable>

      {/* 3rd — Grouped horizontal bar chart */}
      <div className="rounded-2xl bg-white border border-charcoal/[0.08] overflow-hidden">
        <div className="px-5 py-4 border-b border-charcoal/[0.08] bg-cream/60">
          <p className="font-mono text-[10px] tracking-[0.2em] uppercase text-slate">
            ANNUAL PROPERTY TAX BY ASSESSED VALUATION
          </p>
        </div>
        <div className="px-4 py-5">
          <div style={{ height: 440 }} className="w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={chartData}
                layout="vertical"
                margin={{ top: 8, right: 16, left: 8, bottom: 4 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#00000010" horizontal={false} />
                <XAxis
                  type="number"
                  tick={{ fontSize: 11, fill: "#5A5A56" }}
                  tickLine={false}
                  axisLine={{ stroke: "#00000015" }}
                  tickFormatter={(v: number) => `$${Math.round(v / 1000)}k`}
                />
                <YAxis
                  type="category"
                  dataKey="label"
                  tick={{ fontSize: 12, fill: "#5A5A56" }}
                  tickLine={false}
                  axisLine={{ stroke: "#00000015" }}
                  width={48}
                />
                <Tooltip content={<ChartTooltip />} cursor={{ fill: "#1B2A4A08" }} />
                <Legend wrapperStyle={{ fontSize: 12 }} iconType="circle" iconSize={9} />
                {towns.map((t) => (
                  <Bar
                    key={t.name}
                    dataKey={t.name}
                    fill={t.color}
                    radius={[0, 3, 3, 0]}
                    maxBarSize={26}
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <p className="text-xs text-slate/80 leading-relaxed">
        Estimates apply Connecticut&apos;s statutory 70% assessment ratio to a
        home&apos;s market value (a $1M home is assessed at $700,000). Figures are
        for comparison only — actual bills depend on each town&apos;s most recent
        revaluation and any district, fire, sewer or garbage levies. Norwalk&apos;s
        rate is its core taxing-district rate and varies by district; a lower mill
        rate does not necessarily mean a lower bill after a revaluation.
      </p>
    </div>
  );
}
