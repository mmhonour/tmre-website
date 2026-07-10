"use client";

import { useEffect, useState, type ReactNode } from "react";
import { StatsChartFrameProvider } from "./stats-chart-frame-context";
import { printStatsChart, type StatsPrintMode } from "./stats-print";

type StatsChartPrintFrameProps = {
  chartId: string;
  title?: string;
  children: ReactNode;
  dataPanel?: ReactNode;
  className?: string;
};

const toolbarBtnClass =
  "font-mono text-[10px] tracking-[0.12em] uppercase text-navy hover:text-gold transition-colors border border-charcoal/15 hover:border-gold rounded-full px-3 py-1 bg-white/80 backdrop-blur-sm disabled:opacity-40 disabled:pointer-events-none disabled:hover:text-navy disabled:hover:border-charcoal/15";

const checkboxLabelClass =
  "inline-flex items-center gap-1.5 font-mono text-[10px] tracking-[0.1em] uppercase text-slate cursor-pointer select-none";

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
        className={toolbarBtnClass}
        aria-label={title ? `Print ${title}` : "Print chart"}
      >
        Print
      </button>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <label className={checkboxLabelClass}>
          <input
            type="checkbox"
            checked={printChart}
            onChange={(e) => setPrintChart(e.target.checked)}
            className="h-3 w-3 rounded border-charcoal/25 text-gold focus:ring-gold/40"
          />
          Chart
        </label>
        <label className={checkboxLabelClass}>
          <input
            type="checkbox"
            checked={printData}
            onChange={(e) => setPrintData(e.target.checked)}
            className="h-3 w-3 rounded border-charcoal/25 text-gold focus:ring-gold/40"
          />
          Data
        </label>
      </div>
      <button
        type="button"
        onClick={handlePrint}
        disabled={printMode == null}
        className={toolbarBtnClass}
        aria-label={title ? `Print ${title}` : "Print selected"}
      >
        Print
      </button>
    </div>
  );
}

export default function StatsChartPrintFrame({
  chartId,
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
      className={`stats-chart-print-frame relative scroll-mt-28 ${className}`.trim()}
      data-stats-chart-id={chartId}
      data-stats-data-open={dataPanel && dataOpen ? "true" : undefined}
    >
      {chartReady && title ? (
        <p className="font-mono text-[11px] tracking-[0.2em] uppercase text-slate mb-4 stats-print-screen-only">
          {title}
        </p>
      ) : null}
      {chartReady ? (
        <div
          className={`stats-print-screen-only flex flex-wrap items-center gap-2 mb-2 -mt-1${
            dataPanel ? "" : " justify-end"
          }`}
        >
          {dataPanel ? (
            <button
              type="button"
              onClick={() => setDataOpen((open) => !open)}
              aria-expanded={dataOpen}
              className={toolbarBtnClass}
            >
              {dataOpen ? "Hide data" : "Show data"}
            </button>
          ) : null}
          <div className={`flex flex-wrap gap-2${dataPanel ? " ml-auto" : ""}`}>
            <StatsPrintControls
              chartId={chartId}
              title={title}
              hasData={dataPanel != null}
            />
          </div>
        </div>
      ) : null}
      <StatsChartFrameProvider setChartReady={setChartReady}>
        <div data-stats-print-chart>{children}</div>
      </StatsChartFrameProvider>
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
