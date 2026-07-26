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

/** Tailwind `lg` — desktop Criteria title placement vs mobile in-panel. */
export function useListingDesktopLayout(): boolean | null {
  const [isDesktop, setIsDesktop] = useState<boolean | null>(null);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const update = () => setIsDesktop(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return isDesktop;
}

/**
 * Desktop: "Criteria" / "Hide criteria" portals beside the section title
 * (What if / Sold / Rented / Under agreement); the criteria panel always
 * portals above Location in the right column when open.
 * Visibility is shared across analysis tabs when wrapped in
 * ListingCriteriaVisibilityProvider.
 * Mobile: in-panel link (Sold / Rented / UAG) or What if sell/rent header → drawer.
 */
export default function ListingCriteriaSideLayout({
  criteria,
  heading,
  linkSlotId,
  linkSlotIds,
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
  /** Extra portal targets (e.g. What if sell + rent panel headers on mobile). */
  linkSlotIds?: readonly string[] | null;
  children: ReactNode;
}) {
  const shared = useListingCriteriaVisibility();
  const [localOpen, setLocalOpen] = useState(false);
  const open = shared ? shared.open : localOpen;
  const setOpen = shared ? shared.setOpen : setLocalOpen;
  const toggle = shared
    ? shared.toggle
    : () => setLocalOpen((v) => !v);

  const isDesktop = useListingDesktopLayout() === true;
  const [desktopSlot, setDesktopSlot] = useState<HTMLElement | null>(null);
  const [linkSlots, setLinkSlots] = useState<HTMLElement[]>([]);
  const [sectionVisible, setSectionVisible] = useState(true);

  const headingLabel = heading.trim().toUpperCase();
  const allLinkSlotIds = [
    ...(linkSlotId ? [linkSlotId] : []),
    ...(linkSlotIds ?? []),
  ];

  useEffect(() => {
    if (!criteria) {
      setDesktopSlot(null);
      setLinkSlots([]);
      return;
    }
    const sync = () => {
      setDesktopSlot(document.getElementById(LISTING_CRITERIA_SLOT_ID));
      const found = allLinkSlotIds
        .map((id) => document.getElementById(id))
        .filter((el): el is HTMLElement => Boolean(el));
      setLinkSlots(found);
      const section =
        found[0]?.closest("section") ??
        document.getElementById(allLinkSlotIds[0] ?? "")?.closest("section");
      setSectionVisible(!section || !section.hasAttribute("hidden"));
    };
    sync();
    // Dynamic Sold/Rented/UAG bodies mount after the title slot (and after
    // panel-mode lazy mount). Keep syncing longer so Criteria doesn't miss
    // the portal target on a cold tab open.
    const interval = window.setInterval(sync, 100);
    const stop = window.setTimeout(() => window.clearInterval(interval), 8000);
    return () => {
      window.clearInterval(interval);
      window.clearTimeout(stop);
    };
    // allLinkSlotIds joined — stable enough for sync dependency
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [criteria, linkSlotId, linkSlotIds?.join("|"), open, isDesktop]);

  // Follow section show/hide when switching analysis tabs (shared open stays).
  useEffect(() => {
    if (allLinkSlotIds.length === 0) {
      setSectionVisible(true);
      return;
    }
    const link = document.getElementById(allLinkSlotIds[0]!);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allLinkSlotIds.join("|"), criteria]);

  if (!criteria) {
    return <>{children}</>;
  }

  const toggleLinkClass =
    "shrink-0 font-mono text-[10px] tracking-[0.18em] uppercase text-gold/80 underline decoration-gold/35 underline-offset-2 transition-colors hover:text-gold whitespace-nowrap";

  const renderCriteriaToggle = (key?: string) => (
    <button
      key={key}
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
    <div className="min-w-0 w-full rounded-2xl border border-white/10 bg-[#152238] p-4 text-left shadow-[0_8px_24px_-12px_rgba(0,0,0,0.55)]">
      <p className="mb-3 font-mono text-[10px] tracking-[0.2em] uppercase text-gold">
        {headingLabel}
      </p>
      {criteria}
    </div>
  );

  // Panel always above Location; only the active tab fills the shared slot.
  const showDesktopPanel =
    isDesktop && open && desktopSlot && sectionVisible;

  const showTitleLink = linkSlots.length > 0 && sectionVisible;
  // Mobile fallback when the title slot isn't ready yet (dynamic panel mount).
  const showMobileFallback = !isDesktop && sectionVisible && !showTitleLink;
  const showDesktopFallback = isDesktop && linkSlots.length === 0 && sectionVisible;

  return (
    <>
      {showMobileFallback || showDesktopFallback ? (
        <div className="mb-3 flex justify-end max-lg:px-3 lg:px-0">
          {renderCriteriaToggle()}
        </div>
      ) : null}

      <div className="min-w-0 space-y-2 lg:space-y-6">{children}</div>

      {showTitleLink
        ? linkSlots.map((slot, i) =>
            createPortal(renderCriteriaToggle(`criteria-link-${i}`), slot),
          )
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
