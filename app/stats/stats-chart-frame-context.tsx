"use client";

import { createContext, useContext, useEffect, type ReactNode } from "react";

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
  return (
    <StatsChartFrameContext.Provider value={{ setChartReady }}>
      {children}
    </StatsChartFrameContext.Provider>
  );
}

export function useStatsChartReady(ready: boolean) {
  const ctx = useContext(StatsChartFrameContext);
  useEffect(() => {
    if (!ctx) return;
    ctx.setChartReady(ready);
    return () => ctx.setChartReady(false);
  }, [ready, ctx]);
}
