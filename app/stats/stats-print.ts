const PRINTING_CLASS = "is-stats-printing";

export type StatsPrintMode = "chart" | "data" | "both";

function addPrintClasses(...classes: string[]) {
  document.body.classList.add(PRINTING_CLASS, ...classes);
}

function clearPrintClasses() {
  document.body.classList.remove(PRINTING_CLASS);
  for (const cls of [...document.body.classList]) {
    if (cls.startsWith("stats-print-target-") || cls.startsWith("stats-print-mode-")) {
      document.body.classList.remove(cls);
    }
  }
}

function runPrint(targetClass: string, modeClass: string) {
  addPrintClasses(targetClass, modeClass);
  const cleanup = () => {
    clearPrintClasses();
    window.removeEventListener("afterprint", cleanup);
  };
  window.addEventListener("afterprint", cleanup);
  window.print();
}

/** Print one stats chart by its `data-stats-chart-id`. */
export function printStatsChart(chartId: string, mode: StatsPrintMode = "chart"): void {
  runPrint(`stats-print-target-${chartId}`, `stats-print-mode-${mode}`);
}
