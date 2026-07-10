/** Earliest year shown on the closed sales-by-month chart. */
export const STATS_MONTH_CHART_START_YEAR = 2019;

/** Calendar years available on the sales-by-month chart (2019 → current). */
export function statsMonthChartYears(now = new Date()): number[] {
  const current = now.getFullYear();
  const years: number[] = [];
  for (let y = STATS_MONTH_CHART_START_YEAR; y <= current; y++) {
    years.push(y);
  }
  return years;
}

/** Default comparison set: the three most recent years. */
export function defaultStatsMonthCompareYears(now = new Date()): number[] {
  return statsMonthChartYears(now).slice(-3);
}
