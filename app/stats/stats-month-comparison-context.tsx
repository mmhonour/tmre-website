"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  buildMonthSlots,
  DEFAULT_COMPARE_YEARS,
  FULL_CHART_YEARS,
  isFutureCalendarMonth,
  sortYears,
  type TimelineMode,
} from "./stats-month-chart-utils";
import {
  readPersistedTimelineMode,
  readPersistedYears,
  writePersistedTimelineMode,
  writePersistedYears,
} from "./stats-view-prefs";

export type StatsMonthComparisonViewState = {
  compareYears: readonly number[];
  yearSelectionEnabled: boolean;
  timelineModeEnabled: boolean;
  selectedYears: Set<number>;
  toggleYear: (yr: number) => void;
  visibleYears: number[];
  timelineMode: TimelineMode;
  setTimelineMode: (mode: TimelineMode) => void;
  multiYearMode: boolean;
  continuousMode: boolean;
  monthCount: number;
};

const StatsMonthComparisonViewContext = createContext<StatsMonthComparisonViewState | null>(
  null,
);

export function StatsMonthComparisonViewProvider({
  children,
  resetKey,
  compareYears = FULL_CHART_YEARS,
  defaultCompareYears = DEFAULT_COMPARE_YEARS,
  yearSelectionEnabled = true,
  timelineModeEnabled = yearSelectionEnabled,
}: {
  children: ReactNode;
  /** When this changes, year selection resets (e.g. city + kind). */
  resetKey?: string;
  compareYears?: readonly number[];
  defaultCompareYears?: readonly number[];
  yearSelectionEnabled?: boolean;
  timelineModeEnabled?: boolean;
}) {
  const yearsPrefKey = `tmre_stats_month_years:${resetKey ?? "default"}`;
  const timelinePrefKey = `tmre_stats_month_timeline:${resetKey ?? "default"}`;
  const [selectedYears, setSelectedYears] = useState<Set<number>>(() =>
    new Set(
      readPersistedYears(yearsPrefKey, compareYears, defaultCompareYears),
    ),
  );
  const [timelineMode, setTimelineMode] = useState<TimelineMode>(
    () => readPersistedTimelineMode(timelinePrefKey) ?? "calendar",
  );
  const [prefsHydrated, setPrefsHydrated] = useState(false);

  useEffect(() => {
    if (!yearSelectionEnabled) return;
    setSelectedYears(
      new Set(readPersistedYears(yearsPrefKey, compareYears, defaultCompareYears)),
    );
    setTimelineMode(readPersistedTimelineMode(timelinePrefKey) ?? "calendar");
    setPrefsHydrated(true);
  }, [resetKey, defaultCompareYears, yearSelectionEnabled, yearsPrefKey, timelinePrefKey, compareYears]);

  useEffect(() => {
    if (!yearSelectionEnabled || !prefsHydrated) return;
    writePersistedYears(yearsPrefKey, selectedYears);
  }, [selectedYears, yearsPrefKey, yearSelectionEnabled, prefsHydrated]);

  useEffect(() => {
    if (!prefsHydrated) return;
    writePersistedTimelineMode(timelinePrefKey, timelineMode);
  }, [timelineMode, timelinePrefKey, prefsHydrated]);

  const toggleYear = useCallback(
    (yr: number) => {
      if (!yearSelectionEnabled) return;
      setSelectedYears((prev) => {
        const next = new Set(prev);
        if (next.has(yr)) {
          if (next.size <= 1) return prev;
          next.delete(yr);
        } else {
          next.add(yr);
        }
        return next;
      });
    },
    [yearSelectionEnabled],
  );

  const visibleYears = useMemo(
    () => (yearSelectionEnabled ? sortYears(selectedYears) : [...defaultCompareYears]),
    [selectedYears, yearSelectionEnabled, defaultCompareYears],
  );

  const multiYearMode = visibleYears.length > 1;
  const continuousMode =
    timelineModeEnabled && multiYearMode && timelineMode === "continuous";
  const monthCount = useMemo(
    () => buildMonthSlots(visibleYears, isFutureCalendarMonth).length,
    [visibleYears],
  );

  useEffect(() => {
    if (!multiYearMode && timelineMode === "continuous") {
      setTimelineMode("calendar");
    }
  }, [multiYearMode, timelineMode]);

  const value = useMemo<StatsMonthComparisonViewState>(
    () => ({
      compareYears,
      yearSelectionEnabled,
      timelineModeEnabled,
      selectedYears,
      toggleYear,
      visibleYears,
      timelineMode,
      setTimelineMode,
      multiYearMode,
      continuousMode,
      monthCount,
    }),
    [
      compareYears,
      yearSelectionEnabled,
      timelineModeEnabled,
      selectedYears,
      toggleYear,
      visibleYears,
      timelineMode,
      multiYearMode,
      continuousMode,
      monthCount,
    ],
  );

  return (
    <StatsMonthComparisonViewContext.Provider value={value}>
      {children}
    </StatsMonthComparisonViewContext.Provider>
  );
}

export function useStatsMonthComparisonView(): StatsMonthComparisonViewState {
  const ctx = useContext(StatsMonthComparisonViewContext);
  if (!ctx) {
    throw new Error(
      "useStatsMonthComparisonView must be used within StatsMonthComparisonViewProvider",
    );
  }
  return ctx;
}

export function useStatsMonthComparisonViewOptional(): StatsMonthComparisonViewState | null {
  return useContext(StatsMonthComparisonViewContext);
}
