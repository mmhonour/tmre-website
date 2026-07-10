"use client";

import { type ReactNode } from "react";
import { ActiveByTownViewProvider } from "./active-by-town-context";
import type { StatsKind } from "./stats-towns";

export default function ActiveByTownView({
  kind,
  children,
}: {
  kind: StatsKind;
  children: ReactNode;
}) {
  return <ActiveByTownViewProvider resetKey={kind}>{children}</ActiveByTownViewProvider>;
}
