"use client";

import { useEffect, useState, type ReactNode } from "react";
import { StatsChartFrameProvider } from "./stats-chart-frame-context";
import { printStatsChart, type StatsPrintMode } from "./stats-print";
import { STATS_SCROLL_MT } from "./stats-scroll";

type StatsChartPrintFrameProps = {
  chartId: string;
  /** Older `#stats-chart-{id}` hashes that should still land on this frame. */
  aliasChartIds?: readonly string[];
  title?: string;
  children: ReactNode;
  dataPanel?: ReactNode;
  className?: string;
};

/** Flat link controls — sit just over the top edge of each graph. */
const overlayLinkClass =
  "bg-transparent p-0 m-0 border-0 cursor-pointer font-mono text-[10px] tracking-[0.12em] uppercase text-navy underline decoration-navy/25 underline-offset-2 hover:text-gold hover:decoration-gold/50 transition-colors disabled:opacity-35 disabled:pointer-events-none disabled:no-underline";

const overlayLinkMutedClass =
  "bg-transparent p-0 m-0 border-0 cursor-pointer font-mono text-[10px] tracking-[0.12em] uppercase text-charcoal/40 underline decoration-charcoal/15 underline-offset-2 hover:text-navy hover:decoration-navy/30 transition-colors";

function resolvePrintMode(
  printChart: boolean,
  printData: boolean,
): StatsPrintMode | null {
  if (printChart && printData) return "both";
  if (printChart) return "chart";
  if (printData) return "data";
  return null;
}

function StatsPrintControls({
  chartId,
  title,
  hasData,
}: {
  chartId: string;
  title?: string;
  hasData: boolean;
}) {
  const [printChart, setPrintChart] = useState(true);
  const [printData, setPrintData] = useState(false);

  const printMode = resolvePrintMode(printChart, printData);

  const handlePrint = () => {
    const mode = resolvePrintMode(printChart, printData);
    if (mode) printStatsChart(chartId, mode);
  };

  if (!hasData) {
    return (
      <button
        type="button"
        onClick={() => printStatsChart(chartId, "chart")}
        className={overlayLinkClass}
        aria-label={title ? `Print ${title}` : "Print chart"}
      >
        Print
      </button>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setPrintChart((v) => !v)}
        aria-pressed={printChart}
        className={printChart ? overlayLinkClass : overlayLinkMutedClass}
      >
        Chart{printChart ? " ✓" : ""}
      </button>
      <button
        type="button"
        onClick={() => setPrintData((v) => !v)}
        aria-pressed={printData}
        className={printData ? overlayLinkClass : overlayLinkMutedClass}
      >
        Data{printData ? " ✓" : ""}
      </button>
      <button
        type="button"
        onClick={handlePrint}
        disabled={printMode == null}
        className={overlayLinkClass}
        aria-label={title ? `Print ${title}` : "Print selected"}
      >
        Print
      </button>
    </>
  );
}

export default function StatsChartPrintFrame({
  chartId,
  aliasChartIds,
  title,
  children,
  dataPanel,
  className = "",
}: StatsChartPrintFrameProps) {
  const [dataOpen, setDataOpen] = useState(false);
  const [chartReady, setChartReady] = useState(false);

  useEffect(() => {
    setChartReady(false);
  }, [children]);

  return (
    <div
      id={`stats-chart-${chartId}`}
      className={`stats-chart-print-frame relative ${STATS_SCROLL_MT} ${className}`.trim()}
      data-stats-chart-id={chartId}
      data-stats-chart-ready={chartReady ? "true" : "false"}
      data-stats-data-open={dataPanel && dataOpen ? "true" : undefined}
    >
      {aliasChartIds?.map((alias) => (
        <span key={alias} id={`stats-chart-${alias}`} hidden />
      ))}
      {chartReady && title ? (
        <p className="font-mono text-[11px] tracking-[0.2em] uppercase text-slate mb-2 stats-print-screen-only">
          {title}
        </p>
      ) : null}
      <div className="relative">
        {chartReady ? (
          <div className="stats-print-screen-only absolute right-3 -top-2.5 z-20 flex flex-wrap items-center justify-end gap-x-3 gap-y-1 sm:right-4">
            {dataPanel ? (
              <button
                type="button"
                onClick={() => setDataOpen((open) => !open)}
                aria-expanded={dataOpen}
                className={overlayLinkClass}
              >
                {dataOpen ? "Hide data" : "Show data"}
              </button>
            ) : null}
            <StatsPrintControls
              chartId={chartId}
              title={title}
              hasData={dataPanel != null}
            />
          </div>
        ) : null}
        <StatsChartFrameProvider setChartReady={setChartReady}>
          <div data-stats-print-chart>{children}</div>
        </StatsChartFrameProvider>
      </div>
      {chartReady && dataPanel ? (
        <div
          className={dataOpen ? "mt-4" : "hidden"}
          data-stats-print-data
          aria-hidden={!dataOpen}
        >
          {dataPanel}
        </div>
      ) : null}
    </div>
  );
}
