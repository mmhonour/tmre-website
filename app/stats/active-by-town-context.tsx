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
  sortYears,
  type TimelineMode,
} from "./stats-month-chart-utils";
import {
  readPersistedTimelineMode,
  readPersistedYears,
  writePersistedTimelineMode,
  writePersistedYears,
} from "./stats-view-prefs";

const CURRENT_YEAR = new Date().getFullYear();

function isFutureMonth(year: number, month: number): boolean {
  return year === CURRENT_YEAR && month > new Date().getMonth() + 1;
}

export type ActiveByTownViewState = {
  chartYears: readonly number[];
  selectedYears: Set<number>;
  toggleYear: (yr: number) => void;
  visibleYears: number[];
  timelineMode: TimelineMode;
  setTimelineMode: (mode: TimelineMode) => void;
  multiYearMode: boolean;
  continuousMode: boolean;
  calendarMultiYearMode: boolean;
  singleYear: number | null;
  monthCount: number;
};

const ActiveByTownViewContext = createContext<ActiveByTownViewState | null>(null);

export function ActiveByTownViewProvider({
  children,
  resetKey,
}: {
  children: ReactNode;
  resetKey?: string;
}) {
  const yearsPrefKey = `tmre_stats_active_town_years:${resetKey ?? "default"}`;
  const timelinePrefKey = `tmre_stats_active_town_timeline:${resetKey ?? "default"}`;
  const [selectedYears, setSelectedYears] = useState<Set<number>>(() =>
    new Set(readPersistedYears(yearsPrefKey, FULL_CHART_YEARS, DEFAULT_COMPARE_YEARS)),
  );
  const [timelineMode, setTimelineMode] = useState<TimelineMode>(
    () => readPersistedTimelineMode(timelinePrefKey) ?? "calendar",
  );
  const [prefsHydrated, setPrefsHydrated] = useState(false);

  useEffect(() => {
    setSelectedYears(
      new Set(readPersistedYears(yearsPrefKey, FULL_CHART_YEARS, DEFAULT_COMPARE_YEARS)),
    );
    setTimelineMode(readPersistedTimelineMode(timelinePrefKey) ?? "calendar");
    setPrefsHydrated(true);
  }, [resetKey, yearsPrefKey, timelinePrefKey]);

  useEffect(() => {
    if (!prefsHydrated) return;
    writePersistedYears(yearsPrefKey, selectedYears);
  }, [selectedYears, yearsPrefKey, prefsHydrated]);

  useEffect(() => {
    if (!prefsHydrated) return;
    writePersistedTimelineMode(timelinePrefKey, timelineMode);
  }, [timelineMode, timelinePrefKey, prefsHydrated]);

  const toggleYear = useCallback((yr: number) => {
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
  }, []);

  const visibleYears = useMemo(() => sortYears(selectedYears), [selectedYears]);
  const multiYearMode = visibleYears.length > 1;
  const singleYear = visibleYears.length === 1 ? visibleYears[0]! : null;
  const continuousMode = multiYearMode && timelineMode === "continuous";
  const calendarMultiYearMode = multiYearMode && timelineMode === "calendar";
  const monthCount = useMemo(
    () => buildMonthSlots(visibleYears, isFutureMonth).length,
    [visibleYears],
  );

  useEffect(() => {
    if (!multiYearMode && timelineMode === "continuous") {
      setTimelineMode("calendar");
    }
  }, [multiYearMode, timelineMode]);

  const value = useMemo<ActiveByTownViewState>(
    () => ({
      chartYears: FULL_CHART_YEARS,
      selectedYears,
      toggleYear,
      visibleYears,
      timelineMode,
      setTimelineMode,
      multiYearMode,
      continuousMode,
      calendarMultiYearMode,
      singleYear,
      monthCount,
    }),
    [
      selectedYears,
      toggleYear,
      visibleYears,
      timelineMode,
      multiYearMode,
      continuousMode,
      calendarMultiYearMode,
      singleYear,
      monthCount,
    ],
  );

  return (
    <ActiveByTownViewContext.Provider value={value}>
      {children}
    </ActiveByTownViewContext.Provider>
  );
}

export function useActiveByTownView(): ActiveByTownViewState {
  const ctx = useContext(ActiveByTownViewContext);
  if (!ctx) {
    throw new Error("useActiveByTownView must be used within ActiveByTownViewProvider");
  }
  return ctx;
}

export function useActiveByTownViewOptional(): ActiveByTownViewState | null {
  return useContext(ActiveByTownViewContext);
}
