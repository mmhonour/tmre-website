"use client";

import { createContext, useContext, useEffect, useState } from "react";

type SiteUnlockContextValue = {
  unlocked: boolean;
  setUnlocked: (unlocked: boolean) => void;
};

const SiteUnlockContext = createContext<SiteUnlockContextValue>({
  unlocked: false,
  setUnlocked: () => {},
});

/** True when the site-password cookie is set (Admin / Visitors unlock). */
export function SiteUnlockProvider({
  unlocked,
  children,
}: {
  unlocked: boolean;
  children: React.ReactNode;
}) {
  const [isUnlocked, setIsUnlocked] = useState(unlocked);

  useEffect(() => {
    setIsUnlocked(unlocked);
  }, [unlocked]);

  return (
    <SiteUnlockContext.Provider
      value={{ unlocked: isUnlocked, setUnlocked: setIsUnlocked }}
    >
      {children}
    </SiteUnlockContext.Provider>
  );
}

export function useSiteUnlocked(): boolean {
  return useContext(SiteUnlockContext).unlocked;
}

export function useSiteUnlockActions(): Pick<SiteUnlockContextValue, "setUnlocked"> {
  return useContext(SiteUnlockContext);
}

/** Format a 0–1 Goldilocks weight as a whole-number percent. */
export function formatScoreWeightPct(weight: number): string {
  return `${Math.round(weight * 100)}%`;
}
