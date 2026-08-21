"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, type PointerEvent, type ReactNode } from "react";
import ListingPropertyFacts, {
  type ListingPropertyFactsProps,
} from "@/components/listing/ListingPropertyFacts";

const ListingIfPageContent = dynamic(
  () =>
    import("@/components/listing/ListingIfPanel").then((m) => ({
      default: m.ListingIfPageContent,
    })),
  {
    loading: () => (
      <p className="py-4 font-mono text-[10px] uppercase tracking-wide text-white/45">
        Loading What if…
      </p>
    ),
    ssr: false,
  },
);

export type FactsSheetSection = "insight" | "details" | "if";

export default function ListingOverviewFactsSheet({
  facts,
  insight,
  details,
  ifProps,
  expanded,
  onExpandedChange,
  focusSection = null,
}: {
  facts: ListingPropertyFactsProps;
  insight: ReactNode;
  details: ReactNode;
  ifProps: {
    mlsId: string;
    addressHint?: string | null;
    townHint?: string | null;
    routeBase?: "listing" | "spotlight";
    isRental?: boolean | null;
  };
  expanded: boolean;
  onExpandedChange: (open: boolean) => void;
  focusSection?: FactsSheetSection | null;
}) {
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const dragStartY = useRef<number | null>(null);
  const didDrag = useRef(false);

  useEffect(() => {
    if (!expanded || !focusSection || !bodyRef.current) return;
    const el = bodyRef.current.querySelector(`[data-facts-section="${focusSection}"]`);
    if (el instanceof HTMLElement) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [expanded, focusSection]);

  const onHandlePointerDown = (event: PointerEvent<HTMLButtonElement>) => {
    dragStartY.current = event.clientY;
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onHandlePointerUp = (event: PointerEvent<HTMLButtonElement>) => {
    if (dragStartY.current == null) return;
    const dy = event.clientY - dragStartY.current;
    dragStartY.current = null;
    if (dy < -36) {
      didDrag.current = true;
      onExpandedChange(true);
    } else if (dy > 36) {
      didDrag.current = true;
      onExpandedChange(false);
    }
  };

  return (
    <div
      id="listing-overview-facts-sheet"
      className="pointer-events-none fixed inset-x-0 bottom-0 z-30 lg:hidden"
      aria-label="Property facts"
    >
      <div
        className={`pointer-events-auto flex flex-col overflow-hidden border-t border-white/10 bg-[#1B2A4A]/95 shadow-[0_-8px_24px_-12px_rgba(0,0,0,0.55)] backdrop-blur-md transition-[max-height] duration-200 ease-out ${
          expanded ? "h-[min(78dvh,40rem)] max-h-[min(78dvh,40rem)]" : ""
        }`}
      >
        <button
          type="button"
          className="shrink-0 cursor-grab touch-none px-3 pt-1.5 pb-1 active:cursor-grabbing"
          onPointerDown={onHandlePointerDown}
          onPointerUp={onHandlePointerUp}
          onClick={() => {
            if (didDrag.current) {
              didDrag.current = false;
              return;
            }
            onExpandedChange(!expanded);
          }}
          aria-expanded={expanded}
        >
          <div className="mx-auto h-1 w-10 rounded-full bg-white/25" aria-hidden />
          <span className="mt-1 block w-full font-mono text-[8px] tracking-[0.16em] uppercase text-white/40">
            {expanded ? "Hide Insight · Details · What if" : "Swipe up for Insight · Details · What if"}
          </span>
        </button>
        <div className="shrink-0 px-3 pb-2">
          <ListingPropertyFacts {...facts} />
        </div>
        <div
          ref={bodyRef}
          className={`min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-3 pb-[max(0.75rem,env(safe-area-inset-bottom,0px))] ${
            expanded ? "block" : "hidden"
          }`}
        >
          <section data-facts-section="insight" className="scroll-mt-2 border-t border-white/10 pt-3">
            <p className="mb-2 font-mono text-[10px] tracking-[0.2em] uppercase text-gold">
              Insight
            </p>
            {insight}
          </section>
          <section data-facts-section="details" className="scroll-mt-2 mt-4 border-t border-white/10 pt-3">
            <p className="mb-2 font-mono text-[10px] tracking-[0.2em] uppercase text-gold">
              Details
            </p>
            {details}
          </section>
          <section data-facts-section="if" className="scroll-mt-2 mt-4 border-t border-white/10 pt-3">
            <p className="mb-2 font-mono text-[10px] tracking-[0.2em] uppercase text-gold">
              What if
            </p>
            {expanded ? (
              <ListingIfPageContent
                mlsId={ifProps.mlsId}
                addressHint={ifProps.addressHint}
                townHint={ifProps.townHint}
                routeBase={ifProps.routeBase}
                isRental={ifProps.isRental}
                suppressPageChrome
              />
            ) : null}
          </section>
        </div>
      </div>
    </div>
  );
}
