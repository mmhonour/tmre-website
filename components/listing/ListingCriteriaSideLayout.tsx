"use client";

import { useEffect, useState, type ReactNode } from "react";
import ListingSideDrawer from "@/components/listing/ListingSideDrawer";

/**
 * Desktop: sticky Criteria column beside main comps content.
 * Mobile: Criteria edge tab → right slide-over (same chrome as Map / Details).
 */
export default function ListingCriteriaSideLayout({
  criteria,
  children,
}: {
  /** When null, children render full-width with no side chrome. */
  criteria: ReactNode | null;
  children: ReactNode;
}) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [isDesktop, setIsDesktop] = useState(true);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const update = () => setIsDesktop(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if (isDesktop) setDrawerOpen(false);
  }, [isDesktop]);

  if (!criteria) {
    return <>{children}</>;
  }

  const edgeTabClass = (active: boolean) =>
    `flex items-center justify-center rounded-l-lg border border-r-0 px-1.5 py-3 shadow-[-4px_0_16px_-8px_rgba(0,0,0,0.55)] transition-colors ${
      active
        ? "border-gold/50 bg-gold text-navy"
        : "border-white/15 bg-[#1B2A4A]/95 text-gold backdrop-blur-md hover:border-gold/40 hover:text-gold-light"
    }`;

  return (
    <>
      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(13.5rem,16.5rem)] lg:gap-6 lg:items-start">
        <div className="min-w-0 space-y-6">{children}</div>
        {isDesktop ? (
          <aside className="lg:sticky lg:top-[var(--listing-sticky-offset,6rem)] min-w-0">
            <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
              {criteria}
            </div>
          </aside>
        ) : null}
      </div>

      {!isDesktop ? (
        <>
          <div
            className="fixed right-0 top-[28%] z-[60] flex -translate-y-1/2 flex-col gap-2"
            role="group"
            aria-label="Criteria panel"
          >
            <button
              type="button"
              className={edgeTabClass(drawerOpen)}
              aria-expanded={drawerOpen}
              aria-controls="listing-criteria-drawer"
              onClick={() => setDrawerOpen((open) => !open)}
            >
              <span className="font-mono text-[10px] tracking-[0.18em] uppercase [writing-mode:vertical-rl] rotate-180">
                Criteria
              </span>
            </button>
          </div>
          <ListingSideDrawer
            open={drawerOpen}
            onClose={() => setDrawerOpen(false)}
            title="Criteria"
          >
            <div id="listing-criteria-drawer">{criteria}</div>
          </ListingSideDrawer>
        </>
      ) : null}
    </>
  );
}
