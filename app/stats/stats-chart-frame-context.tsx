"use client";

import { createContext, useContext, useEffect, useMemo, type ReactNode } from "react";

type StatsChartFrameContextValue = {
  setChartReady: (ready: boolean) => void;
};

const StatsChartFrameContext = createContext<StatsChartFrameContextValue | null>(null);

export function StatsChartFrameProvider({
  children,
  setChartReady,
}: {
  children: ReactNode;
  setChartReady: (ready: boolean) => void;
}) {
  const value = useMemo(() => ({ setChartReady }), [setChartReady]);
  return (
    <StatsChartFrameContext.Provider value={value}>
      {children}
    </StatsChartFrameContext.Provider>
  );
}

export function useStatsChartReady(ready: boolean) {
  const ctx = useContext(StatsChartFrameContext);
  const setChartReady = ctx?.setChartReady;
  useEffect(() => {
    if (!setChartReady) return;
    setChartReady(ready);
    return () => setChartReady(false);
  }, [ready, setChartReady]);
}
