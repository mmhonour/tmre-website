"use client";

import { type ReactNode } from "react";
import { StatsMonthComparisonViewProvider } from "./stats-month-comparison-context";
import type { StatsCity, StatsKind } from "./stats-towns";

export default function ActiveByMonthView({
  city,
  kind,
  children,
}: {
  city: StatsCity;
  kind: StatsKind;
  children: ReactNode;
}) {
  return (
    <StatsMonthComparisonViewProvider resetKey={`${city}:${kind}`}>
      {children}
    </StatsMonthComparisonViewProvider>
  );
}
