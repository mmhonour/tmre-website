"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import {
  coverageTownsLabel,
  FALLBACK_COVERAGE_TOWNS,
  knownCoverageTowns,
} from "@/lib/active-coverage-towns";
import type { TmreTown } from "@/lib/tmre-towns";

type CoverageTownsValue = {
  towns: string[];
  knownTowns: TmreTown[];
  townsLabel: string;
};

const CoverageTownsContext = createContext<CoverageTownsValue>({
  towns: [...FALLBACK_COVERAGE_TOWNS],
  knownTowns: [...FALLBACK_COVERAGE_TOWNS],
  townsLabel: coverageTownsLabel(FALLBACK_COVERAGE_TOWNS),
});

export function CoverageTownsProvider({
  towns,
  children,
}: {
  towns: readonly string[];
  children: ReactNode;
}) {
  const value = useMemo<CoverageTownsValue>(() => {
    const list = towns.length > 0 ? [...towns] : [...FALLBACK_COVERAGE_TOWNS];
    return {
      towns: list,
      knownTowns: knownCoverageTowns(list),
      townsLabel: coverageTownsLabel(list),
    };
  }, [towns]);

  return (
    <CoverageTownsContext.Provider value={value}>
      {children}
    </CoverageTownsContext.Provider>
  );
}

export function useCoverageTowns(): CoverageTownsValue {
  return useContext(CoverageTownsContext);
}
