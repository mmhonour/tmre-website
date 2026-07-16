"use client";

import { useEffect, useMemo, useState } from "react";
import {
  TOWN_BUDGET_TOWNS,
  formatBudgetCurrency,
  formatBudgetMillRate,
  getTownBudget,
  getTownBudgetSnapshotsForTown,
  type TownBudgetTown,
} from "@/lib/town-budget";
import TownBudgetPieChart from "./TownBudgetPieChart";
import TownMillRateCompare from "./TownMillRateCompare";
import {
  StatsChartDataTable,
  StatsChartDataTd,
  StatsChartDataTh,
  StatsChartDataRow,
} from "@/app/stats/StatsChartDataTable";

type TownBudgetView = TownBudgetTown | "compare";

export default function TownBudgetClient() {
  const [view, setView] = useState<TownBudgetView>("Westport");
  const town: TownBudgetTown = view === "compare" ? "Westport" : view;
  const isCompare = view === "compare";
  const townSnapshots = useMemo(
    () => (isCompare ? [] : getTownBudgetSnapshotsForTown(town)),
    [isCompare, town],
  );
  const [fiscalYear, setFiscalYear] = useState<string>(() =>
    getTownBudget(town).fiscalYear,
  );

  useEffect(() => {
    if (isCompare) return;
    const latest = getTownBudgetSnapshotsForTown(town)[0];
    if (latest) setFiscalYear(latest.fiscalYear);
  }, [isCompare, town]);

  const budget = useMemo(
    () => getTownBudget(town, fiscalYear),
    [town, fiscalYear],
  );

  return (
    <>
      <section className="navy-gradient text-white pt-20 pb-8 lg:pt-28 lg:pb-12 relative overflow-hidden">
        <div className="absolute inset-0 hero-grid opacity-40" aria-hidden />
        <div className="relative mx-auto max-w-7xl px-6 lg:px-10">
          <p className="font-mono text-[11px] tracking-[0.2em] uppercase text-gold mb-3 animate-fade-up">
            Town Budget
          </p>
          <h1 className="font-serif text-4xl sm:text-5xl lg:text-6xl text-white leading-[1.05] max-w-4xl animate-fade-up">
            Municipal finance &{" "}
            <span className="italic gold-shimmer">property taxes.</span>
          </h1>
          <p className="mt-3 text-sm lg:text-base text-white/70 max-w-2xl leading-relaxed animate-fade-up-delay-1">
            {isCompare
              ? `Mill rates compared across ${TOWN_BUDGET_TOWNS.join(", ")} — filter by fiscal year and see what they cost at $1M–$5M valuations.`
              : `FY ${budget.fiscalYear} budget summary for ${budget.town} — mill rate, revenue and expenditure mix, and the property tax calendar from the official taxpayer guide.`}
          </p>
        </div>
      </section>

      <section className="bg-cream py-10 lg:py-16">
        <div className="mx-auto max-w-7xl px-6 lg:px-10 space-y-10">
          {TOWN_BUDGET_TOWNS.length > 1 ? (
            <div className="flex flex-wrap items-center gap-2">
              {TOWN_BUDGET_TOWNS.map((name) => (
                <button
                  key={name}
                  type="button"
                  onClick={() => setView(name)}
                  className={`rounded-full px-4 py-2 font-mono text-[11px] tracking-wide uppercase transition-colors ${
                    view === name
                      ? "bg-navy text-white"
                      : "bg-white border border-charcoal/15 text-navy hover:border-gold/40"
                  }`}
                >
                  {name}
                </button>
              ))}
              <span className="mx-1 h-5 w-px bg-charcoal/15" aria-hidden />
              <button
                type="button"
                onClick={() => setView("compare")}
                className={`rounded-full px-4 py-2 font-mono text-[11px] tracking-wide uppercase transition-colors ${
                  isCompare
                    ? "bg-gold text-navy"
                    : "bg-white border border-gold/40 text-navy hover:border-gold"
                }`}
              >
                Compare Cost of Living
              </button>
            </div>
          ) : null}

          {!isCompare && townSnapshots.length > 1 ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-[10px] tracking-[0.15em] uppercase text-slate">
                Fiscal year
              </span>
              {townSnapshots.map((snap) => (
                <button
                  key={snap.fiscalYear}
                  type="button"
                  onClick={() => setFiscalYear(snap.fiscalYear)}
                  className={`rounded-full px-3 py-1.5 font-mono text-[10px] tracking-wide uppercase transition-colors ${
                    fiscalYear === snap.fiscalYear
                      ? "bg-gold text-navy"
                      : "bg-white border border-charcoal/15 text-navy hover:border-gold/40"
                  }`}
                >
                  FY {snap.fiscalYear}
                </button>
              ))}
            </div>
          ) : null}

          {isCompare ? <TownMillRateCompare /> : (
          <>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              label="Total budget"
              value={formatBudgetCurrency(budget.totalBudget)}
            />
            <StatCard
              label="Mill rate"
              value={formatBudgetMillRate(budget.millRate.current)}
              detail={`${budget.millRate.changePct > 0 ? "+" : ""}${budget.millRate.changePct.toFixed(2)}% vs ${formatBudgetMillRate(budget.millRate.prior)} prior year`}
            />
            <StatCard
              label="Schools share"
              value={`${budget.allocation[0].sharePct.toFixed(2)}%`}
              detail={formatBudgetCurrency(budget.allocation[0].amount)}
            />
            <StatCard
              label="Fund balance"
              value={`${budget.fundBalanceReservePct.toFixed(1)}%`}
              detail="Conservative reserve (Aaa rating)"
            />
          </div>

          <div className="rounded-2xl bg-white border border-charcoal/[0.08] p-6 lg:p-8">
            <h2 className="font-serif text-2xl text-navy mb-4">Summary</h2>
            <ul className="space-y-2.5 text-sm text-charcoal/80 leading-relaxed list-disc pl-5">
              {budget.highlights.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
            <p className="mt-5 text-xs text-slate/80">
              State assistance estimated at{" "}
              <span className="font-mono text-navy">
                {formatBudgetCurrency(budget.stateAssistance)}
              </span>
              . Source:{" "}
              {budget.sourceUrl ? (
                <a
                  href={budget.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-navy underline decoration-gold/50 hover:decoration-gold"
                >
                  {budget.sourceLabel}
                </a>
              ) : (
                budget.sourceLabel
              )}
              .
            </p>
          </div>

          <div className="grid lg:grid-cols-3 gap-6">
            <TownBudgetPieChart title="Budget allocation" items={budget.allocation} />
            <TownBudgetPieChart title="Revenues" items={budget.revenues} compact />
            <TownBudgetPieChart title="Expenditures" items={budget.expenditures} compact />
          </div>

          <div className="grid lg:grid-cols-2 gap-6">
            <BudgetLineTable
              title="Revenues"
              subtitle={`FY ${budget.fiscalYear} · ${budget.town}`}
              items={budget.revenues}
              total={budget.totalBudget}
            />
            <BudgetLineTable
              title="Expenditures"
              subtitle={`FY ${budget.fiscalYear} · ${budget.town}`}
              items={budget.expenditures}
              total={budget.totalBudget}
            />
          </div>

          <StatsChartDataTable
            title="Tax calendar"
            subtitle={`Property tax due dates · ${budget.town}`}
          >
            <thead>
              <StatsChartDataRow>
                <StatsChartDataTh>Month</StatsChartDataTh>
                <StatsChartDataTh>Date</StatsChartDataTh>
                <StatsChartDataTh>Milestone</StatsChartDataTh>
              </StatsChartDataRow>
            </thead>
            <tbody>
              {budget.taxCalendar.map((row, i) => (
                <StatsChartDataRow key={`${row.month}-${row.day}-${i}`} stripe={i % 2 === 1}>
                  <StatsChartDataTd>{row.month}</StatsChartDataTd>
                  <StatsChartDataTd>{row.day}</StatsChartDataTd>
                  <StatsChartDataTd>{row.note}</StatsChartDataTd>
                </StatsChartDataRow>
              ))}
            </tbody>
          </StatsChartDataTable>

          <div className="rounded-2xl bg-navy/5 border border-navy/10 p-6 lg:p-8">
            <h2 className="font-serif text-xl text-navy mb-3">Taxpayer resources</h2>
            <dl className="grid sm:grid-cols-2 gap-x-8 gap-y-3 text-sm">
              <div>
                <dt className="font-mono text-[10px] uppercase tracking-wider text-slate">
                  Tax collector
                </dt>
                <dd className="text-navy mt-0.5">
                  <a href={`tel:${budget.contacts.taxCollectorPhone.replace(/\D/g, "")}`}>
                    {budget.contacts.taxCollectorPhone}
                  </a>
                  {budget.contacts.taxCollectorEmail ? (
                    <>
                      {" · "}
                      <a
                        href={`mailto:${budget.contacts.taxCollectorEmail}`}
                        className="underline decoration-gold/40"
                      >
                        {budget.contacts.taxCollectorEmail}
                      </a>
                    </>
                  ) : null}
                </dd>
              </div>
              <div>
                <dt className="font-mono text-[10px] uppercase tracking-wider text-slate">
                  Assessor
                </dt>
                <dd className="text-navy mt-0.5">
                  <a href={`tel:${budget.contacts.assessorPhone.replace(/\D/g, "")}`}>
                    {budget.contacts.assessorPhone}
                  </a>
                </dd>
              </div>
              <div>
                <dt className="font-mono text-[10px] uppercase tracking-wider text-slate">
                  Pay online
                </dt>
                <dd className="text-navy mt-0.5">
                  <a
                    href={budget.contacts.payTaxesUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline decoration-gold/40"
                  >
                    {budget.contacts.payTaxesLabel ??
                      budget.contacts.payTaxesUrl.replace(/^https?:\/\//, "")}
                  </a>
                </dd>
              </div>
              <div>
                <dt className="font-mono text-[10px] uppercase tracking-wider text-slate">
                  Town hall
                </dt>
                <dd className="text-navy mt-0.5">{budget.contacts.townHallAddress}</dd>
              </div>
            </dl>
          </div>
          </>
          )}
        </div>
      </section>
    </>
  );
}

function StatCard({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail?: string;
}) {
  return (
    <div className="rounded-2xl bg-white border border-charcoal/[0.08] px-5 py-4">
      <p className="font-mono text-[10px] tracking-[0.15em] uppercase text-slate mb-2">
        {label}
      </p>
      <p className="font-serif text-2xl text-navy">{value}</p>
      {detail ? (
        <p className="mt-1.5 text-xs text-charcoal/60 leading-snug">{detail}</p>
      ) : null}
    </div>
  );
}

function BudgetLineTable({
  title,
  subtitle,
  items,
  total,
}: {
  title: string;
  subtitle: string;
  items: { id: string; label: string; amount: number; sharePct: number }[];
  total: number;
}) {
  return (
    <StatsChartDataTable title={title} subtitle={subtitle}>
      <thead>
        <StatsChartDataRow>
          <StatsChartDataTh>#</StatsChartDataTh>
          <StatsChartDataTh>Category</StatsChartDataTh>
          <StatsChartDataTh align="right">Amount</StatsChartDataTh>
          <StatsChartDataTh align="right">Share</StatsChartDataTh>
        </StatsChartDataRow>
      </thead>
      <tbody>
        {items.map((row, i) => (
          <StatsChartDataRow key={row.id} stripe={i % 2 === 1}>
            <StatsChartDataTd muted>{i + 1}</StatsChartDataTd>
            <StatsChartDataTd>{row.label}</StatsChartDataTd>
            <StatsChartDataTd align="right">
              {formatBudgetCurrency(row.amount)}
            </StatsChartDataTd>
            <StatsChartDataTd align="right" muted>
              {row.sharePct.toFixed(2)}%
            </StatsChartDataTd>
          </StatsChartDataRow>
        ))}
        <StatsChartDataRow>
          <StatsChartDataTd colSpan={2} bold>
            Total
          </StatsChartDataTd>
          <StatsChartDataTd align="right" bold>
            {formatBudgetCurrency(total)}
          </StatsChartDataTd>
          <StatsChartDataTd align="right" bold>
            100.00%
          </StatsChartDataTd>
        </StatsChartDataRow>
      </tbody>
    </StatsChartDataTable>
  );
}
