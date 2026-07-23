"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import ListingSideDrawer from "@/components/listing/ListingSideDrawer";
import { useListingCriteriaVisibility } from "@/components/listing/ListingCriteriaVisibilityContext";

/** Mount point in ListingHeroPanels right column (above Location). */
export const LISTING_CRITERIA_SLOT_ID = "listing-criteria-slot";

/** Link mount next to a section title (`{sectionId}-criteria-link`). */
export function listingCriteriaLinkSlotId(sectionId: string): string {
  return `${sectionId}-criteria-link`;
}

/**
 * Desktop: "Criteria" / "Hide criteria" portals into the panel slot above
 * "N found" (beside Green = exact match); the criteria panel always portals
 * above Location in the right column when open.
 * Visibility is shared across analysis tabs when wrapped in
 * ListingCriteriaVisibilityProvider.
 * Mobile: same in-panel link → right slide-over (no fixed edge tab).
 */
export default function ListingCriteriaSideLayout({
  criteria,
  heading,
  linkSlotId,
  children,
}: {
  /** When null, children render full-width with no side chrome. */
  criteria: ReactNode | null;
  /**
   * Side-panel title when open, e.g. "Sold criteria" → rendered as SOLD CRITERIA.
   */
  heading: string;
  /** Optional portal target beside the section H2 (panel / stack titles). */
  linkSlotId?: string | null;
  children: ReactNode;
}) {
  const shared = useListingCriteriaVisibility();
  const [localOpen, setLocalOpen] = useState(false);
  const open = shared ? shared.open : localOpen;
  const setOpen = shared ? shared.setOpen : setLocalOpen;
  const toggle = shared
    ? shared.toggle
    : () => setLocalOpen((v) => !v);

  const [isDesktop, setIsDesktop] = useState(false);
  const [desktopSlot, setDesktopSlot] = useState<HTMLElement | null>(null);
  const [linkSlot, setLinkSlot] = useState<HTMLElement | null>(null);
  const [sectionVisible, setSectionVisible] = useState(true);

  const headingLabel = heading.trim().toUpperCase();

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const update = () => setIsDesktop(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if (!criteria) {
      setDesktopSlot(null);
      setLinkSlot(null);
      return;
    }
    const sync = () => {
      setDesktopSlot(document.getElementById(LISTING_CRITERIA_SLOT_ID));
      const link = linkSlotId
        ? document.getElementById(linkSlotId)
        : null;
      setLinkSlot(link);
      const section = link?.closest("section");
      setSectionVisible(!section || !section.hasAttribute("hidden"));
    };
    sync();
    // Dynamic Sold/Rented/UAG panels mount after the title slot — keep trying briefly.
    const interval = window.setInterval(sync, 100);
    const stop = window.setTimeout(() => window.clearInterval(interval), 2500);
    return () => {
      window.clearInterval(interval);
      window.clearTimeout(stop);
    };
  }, [criteria, linkSlotId, open, isDesktop]);

  // Follow section show/hide when switching analysis tabs (shared open stays).
  useEffect(() => {
    if (!linkSlotId) {
      setSectionVisible(true);
      return;
    }
    const link = document.getElementById(linkSlotId);
    const section = link?.closest("section");
    if (!section) {
      setSectionVisible(true);
      return;
    }
    const update = () =>
      setSectionVisible(!section.hasAttribute("hidden"));
    update();
    const mo = new MutationObserver(update);
    mo.observe(section, { attributes: true, attributeFilter: ["hidden"] });
    return () => mo.disconnect();
  }, [linkSlotId, criteria]);

  if (!criteria) {
    return <>{children}</>;
  }

  const toggleLinkClass =
    "shrink-0 font-mono text-[10px] tracking-[0.18em] uppercase text-gold/80 underline decoration-gold/35 underline-offset-2 transition-colors hover:text-gold whitespace-nowrap";

  const criteriaToggle = (
    <button
      type="button"
      className={toggleLinkClass}
      aria-expanded={open}
      aria-controls={
        isDesktop ? LISTING_CRITERIA_SLOT_ID : "listing-criteria-drawer"
      }
      onClick={toggle}
    >
      {open ? "Hide criteria" : "Criteria"}
    </button>
  );

  const criteriaPanel = (
    <div className="min-w-0 w-full rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-left">
      <p className="mb-3 font-mono text-[10px] tracking-[0.2em] uppercase text-gold">
        {headingLabel}
      </p>
      {criteria}
    </div>
  );

  // Panel always above Location; only the active tab fills the shared slot.
  const showDesktopPanel =
    isDesktop && open && desktopSlot && sectionVisible;

  const showTitleLink = Boolean(linkSlot && sectionVisible);
  // Mobile fallback when the title slot isn't ready yet (dynamic panel mount).
  const showMobileFallback = !isDesktop && sectionVisible && !showTitleLink;
  const showDesktopFallback = isDesktop && !linkSlot && sectionVisible;

  return (
    <>
      {showMobileFallback || showDesktopFallback ? (
        <div className="mb-3 flex justify-end max-lg:px-3 lg:px-0">
          {criteriaToggle}
        </div>
      ) : null}

      <div className="min-w-0 space-y-6">{children}</div>

      {showTitleLink && linkSlot
        ? createPortal(criteriaToggle, linkSlot)
        : null}

      {showDesktopPanel
        ? createPortal(
            <aside className="min-w-0 w-full" aria-label={headingLabel}>
              {criteriaPanel}
            </aside>,
            desktopSlot,
          )
        : null}

      {!isDesktop && sectionVisible ? (
        <ListingSideDrawer
          open={open}
          onClose={() => setOpen(false)}
          title={headingLabel}
        >
          <div id="listing-criteria-drawer">{criteria}</div>
        </ListingSideDrawer>
      ) : null}
    </>
  );
}
