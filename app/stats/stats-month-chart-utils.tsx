import {
  defaultStatsMonthCompareYears,
  statsMonthChartYears,
} from "@/lib/stats-month-years";

export type MonthlyCount = { year: number; month: number; count: number };

export const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

export function getMonthChartYears(): number[] {
  return statsMonthChartYears();
}

/** Stable year lists for chart defaults (avoid new array refs each render). */
export const FULL_CHART_YEARS = statsMonthChartYears();
export const DEFAULT_COMPARE_YEARS = defaultStatsMonthCompareYears();

export function getCurrentMonthChartYear(): number {
  return statsMonthChartYears().at(-1) ?? statsMonthChartYears()[0] ?? 2026;
}

/** Stable color per calendar year on month comparison charts. */
const YEAR_PALETTE = [
  "#64748b",
  "#7c8aff",
  "#a78bfa",
  "#c084fc",
  "#D4AF37",
  "#38bdf8",
  "#5ba08a",
  "#f472b6",
  "#fb923c",
  "#34d399",
];

export type YearStyle = {
  stroke: string;
  fill: string;
  opacity: number;
  width: number;
  dash?: string;
  dotR: number;
};

export function yearChartStyle(year: number): YearStyle {
  const years = getMonthChartYears();
  const idx = years.indexOf(year);
  const stroke = YEAR_PALETTE[idx >= 0 ? idx % YEAR_PALETTE.length : 0] ?? "#94a3b8";
  const currentYear = getCurrentMonthChartYear();
  const ageFromCurrent = currentYear - year;
  return {
    stroke,
    fill: stroke,
    opacity: Math.max(0.08, 0.24 - ageFromCurrent * 0.018),
    width: ageFromCurrent === 0 ? 3 : ageFromCurrent === 1 ? 2.5 : ageFromCurrent >= 4 ? 1.5 : 2,
    dash: ageFromCurrent >= 3 ? "5 3" : undefined,
    dotR: ageFromCurrent === 0 ? 5 : ageFromCurrent === 1 ? 4 : 3,
  };
}

export type TimelineMode = "calendar" | "continuous";

export type MonthSlot = { year: number; month: number; label: string };

export function continuousMonthLabel(year: number, month: number): string {
  return month === 12 ? String(year) : String(month);
}

export function buildMonthSlots(
  years: readonly number[],
  isFutureMonth: (year: number, month: number) => boolean,
): MonthSlot[] {
  const slots: MonthSlot[] = [];
  for (const yr of sortYears(years)) {
    for (let month = 1; month <= 12; month++) {
      if (isFutureMonth(yr, month)) continue;
      slots.push({
        year: yr,
        month,
        label: continuousMonthLabel(yr, month),
      });
    }
  }
  return slots;
}

export function buildMonthChartData(
  data: MonthlyCount[],
  years: readonly number[],
  isFutureMonth: (year: number, month: number) => boolean,
) {
  return MONTHS.map((name, i) => {
    const month = i + 1;
    const row: Record<string, string | number> = { month: name };
    years.forEach((yr) => {
      const found = data.find((d) => d.year === yr && d.month === month);
      row[String(yr)] = isFutureMonth(yr, month) ? 0 : (found?.count ?? 0);
    });
    return row;
  });
}

/** One point per calendar month across selected years (year labels at each December). */
export function buildContinuousYearChartData(
  data: MonthlyCount[],
  years: readonly number[],
  isFutureMonth: (year: number, month: number) => boolean,
) {
  return buildMonthSlots(years, isFutureMonth).map(({ year, month, label }) => {
    const row: Record<string, string | number | null> = {
      month: label,
      slotLabel: `${MONTHS[month - 1]} ${year}`,
    };
    for (const yr of years) {
      if (yr === year) {
        const found = data.find((d) => d.year === yr && d.month === month);
        row[String(yr)] = isFutureMonth(yr, month) ? 0 : (found?.count ?? 0);
      } else {
        row[String(yr)] = null;
      }
    }
    return row;
  });
}

export function isFutureCalendarMonth(year: number, month: number): boolean {
  const currentYear = getCurrentMonthChartYear();
  return year === currentYear && month > new Date().getMonth() + 1;
}

export const pillClass = (active: boolean) =>
  `font-mono text-[10px] tracking-wide rounded-full px-2.5 py-1 border transition-colors ${
    active
      ? "border-gold/50 bg-gold/10 text-gold"
      : "border-white/10 text-white/40 hover:text-white/70 hover:border-white/20"
  }`;

export function sortYears(years: Iterable<number>): number[] {
  return [...years].sort((a, b) => a - b);
}

export { defaultStatsMonthCompareYears, statsMonthChartYears };

export function GradientDefs({
  id,
  years,
}: {
  id: string;
  years: readonly number[];
}) {
  return (
    <defs>
      {years.map((yr) => {
        const cfg = yearChartStyle(yr);
        return (
          <linearGradient key={yr} id={`${id}-grad-${yr}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={cfg.fill} stopOpacity={cfg.opacity * 2.2} />
            <stop offset="60%" stopColor={cfg.fill} stopOpacity={cfg.opacity * 0.6} />
            <stop offset="100%" stopColor={cfg.fill} stopOpacity={0} />
          </linearGradient>
        );
      })}
    </defs>
  );
}

export function Dot3D({
  cx,
  cy,
  fill,
  r = 5,
}: {
  cx?: number;
  cy?: number;
  fill: string;
  r?: number;
}) {
  if (cx == null || cy == null) return null;
  return (
    <g>
      <circle cx={cx} cy={cy} r={r + 3} fill={fill} opacity={0.15} />
      <circle cx={cx} cy={cy} r={r} fill={fill} opacity={0.9} />
      <circle cx={cx - r * 0.3} cy={cy - r * 0.3} r={r * 0.35} fill="#fff" opacity={0.55} />
    </g>
  );
}
