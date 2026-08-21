"use client";

import dynamic from "next/dynamic";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
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

/** Tallest the sheet may grow, so the photo above always stays partly visible. */
function sheetMaxHeight(): number {
  if (typeof window === "undefined") return 0;
  return Math.min(window.innerHeight * 0.78, 640);
}

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
  const sheetRef = useRef<HTMLDivElement | null>(null);
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const peekRef = useRef<HTMLDivElement | null>(null);
  const bodyInnerRef = useRef<HTMLDivElement | null>(null);

  /** Handle + property facts: the part that stays on screen when collapsed. */
  const [peekHeight, setPeekHeight] = useState(0);
  const [bodyHeight, setBodyHeight] = useState(0);
  const [maxHeight, setMaxHeight] = useState(0);
  /** Live height while a finger is down; written straight to the node. */
  const dragHeightRef = useRef(0);
  const [dragging, setDragging] = useState(false);
  /** Sections mount once the sheet has been opened or touched. */
  const [everOpened, setEverOpened] = useState(false);

  useEffect(() => {
    if (expanded) setEverOpened(true);
  }, [expanded]);

  useEffect(() => {
    const sync = () => setMaxHeight(sheetMaxHeight());
    sync();
    window.addEventListener("resize", sync);
    window.addEventListener("orientationchange", sync);
    return () => {
      window.removeEventListener("resize", sync);
      window.removeEventListener("orientationchange", sync);
    };
  }, []);

  useEffect(() => {
    const peek = peekRef.current;
    if (!peek) return;
    const ro = new ResizeObserver(() => setPeekHeight(peek.offsetHeight));
    ro.observe(peek);
    setPeekHeight(peek.offsetHeight);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const inner = bodyInnerRef.current;
    if (!inner) return;
    const ro = new ResizeObserver(() => setBodyHeight(inner.scrollHeight));
    ro.observe(inner);
    setBodyHeight(inner.scrollHeight);
    return () => ro.disconnect();
  }, [everOpened]);

  /** +1 for the sheet's top border, which border-box counts inside the height. */
  const collapsedHeight = peekHeight > 0 ? peekHeight + 1 : 0;
  const expandedHeight =
    maxHeight > 0 && peekHeight > 0
      ? Math.max(
          collapsedHeight,
          Math.min(maxHeight, collapsedHeight + bodyHeight),
        )
      : 0;
  const settledHeight = expanded ? expandedHeight : collapsedHeight;
  const height = dragging ? dragHeightRef.current : settledHeight;
  /** Anything past the collapsed bar is revealed content, so unclip it. */
  const showBody = everOpened && (dragging || expanded);

  const drag = useRef<{
    pointerId: number;
    startY: number;
    startHeight: number;
    lastY: number;
    lastT: number;
    velocity: number;
    moved: boolean;
  } | null>(null);

  const settle = useCallback(
    (open: boolean) => {
      // Animate from wherever the finger left the sheet. React's own style diff
      // can be a no-op here (same settled value as before the drag), so drive
      // the final height on the node as well.
      const target = open ? expandedHeight : collapsedHeight;
      const node = sheetRef.current;
      if (node && target > 0) {
        node.style.transition = "height 240ms cubic-bezier(0.22,1,0.36,1)";
        node.style.height = `${target}px`;
      }
      dragHeightRef.current = target;
      setDragging(false);
      onExpandedChange(open);
    },
    [collapsedHeight, expandedHeight, onExpandedChange],
  );

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (expandedHeight <= collapsedHeight) return;
    setEverOpened(true);
    dragHeightRef.current = settledHeight;
    drag.current = {
      pointerId: event.pointerId,
      startY: event.clientY,
      startHeight: settledHeight,
      lastY: event.clientY,
      lastT: event.timeStamp,
      velocity: 0,
      moved: false,
    };
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const state = drag.current;
    if (!state || state.pointerId !== event.pointerId) return;
    const dy = state.startY - event.clientY;
    if (!state.moved) {
      if (Math.abs(dy) < 2) return;
      state.moved = true;
      setDragging(true);
      try {
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {
        /* Safari can refuse capture after the gesture ended. */
      }
    }
    const dt = event.timeStamp - state.lastT;
    if (dt > 0) {
      // px/ms, positive = opening.
      state.velocity = (state.lastY - event.clientY) / dt;
      state.lastY = event.clientY;
      state.lastT = event.timeStamp;
    }
    const next = Math.max(
      collapsedHeight,
      Math.min(expandedHeight, state.startHeight + dy),
    );
    dragHeightRef.current = next;
    // Write straight to the node: one style mutation per move beats a React
    // render per frame while the What if body is mounted.
    if (sheetRef.current) sheetRef.current.style.height = `${next}px`;
  };

  const onPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    const state = drag.current;
    if (!state || state.pointerId !== event.pointerId) return;
    drag.current = null;
    try {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
    } catch {
      /* pointer already gone */
    }
    // Tap (no travel) toggles, except on the bed/bath search link.
    if (!state.moved) {
      const target = event.target;
      if (target instanceof Element && target.closest("a")) return;
      settle(!expanded);
      return;
    }
    if (Math.abs(state.velocity) > 0.35) {
      settle(state.velocity > 0);
      return;
    }
    settle(dragHeightRef.current > (collapsedHeight + expandedHeight) / 2);
  };

  useEffect(() => {
    if (!expanded || dragging || !focusSection || !bodyRef.current) return;
    const el = bodyRef.current.querySelector(
      `[data-facts-section="${focusSection}"]`,
    );
    if (el instanceof HTMLElement) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [dragging, expanded, focusSection]);

  return (
    <div
      id="listing-overview-facts-sheet"
      className="pointer-events-none fixed inset-x-0 bottom-0 z-30 lg:hidden"
      aria-label="Property facts"
    >
      <div
        ref={sheetRef}
        className="pointer-events-auto flex flex-col overflow-hidden border-t border-white/10 bg-[#1B2A4A]/95 shadow-[0_-8px_24px_-12px_rgba(0,0,0,0.55)] backdrop-blur-md"
        style={{
          height: peekHeight > 0 ? height : undefined,
          transition: dragging
            ? "none"
            : "height 240ms cubic-bezier(0.22,1,0.36,1)",
        }}
      >
        {/*
          The bar itself is the drag surface: height follows the finger 1:1, so
          the sheet never pops — it rides the gesture and settles on release.
        */}
        <div
          ref={peekRef}
          className="shrink-0 cursor-grab touch-none select-none px-3 pt-1.5 pb-[max(0.5rem,env(safe-area-inset-bottom,0px))] active:cursor-grabbing"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          role="separator"
          aria-orientation="horizontal"
          aria-valuenow={expanded ? 100 : 0}
          aria-label={
            expanded
              ? "Drag down to hide Insight, Details and What if"
              : "Drag up for Insight, Details and What if"
          }
          tabIndex={0}
          onKeyDown={(event) => {
            if (event.key === "ArrowUp") {
              event.preventDefault();
              settle(true);
            } else if (event.key === "ArrowDown" || event.key === "Escape") {
              event.preventDefault();
              settle(false);
            } else if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              settle(!expanded);
            }
          }}
        >
          <div className="mx-auto h-1 w-10 rounded-full bg-white/25" aria-hidden />
          <p className="mt-1 mb-1.5 text-center font-mono text-[8px] tracking-[0.16em] uppercase text-white/40">
            {expanded
              ? "Insight · Details · What if"
              : "Drag up for Insight · Details · What if"}
          </p>
          <ListingPropertyFacts {...facts} />
        </div>
        <div
          ref={bodyRef}
          className={`min-h-0 flex-1 px-3 pb-3 ${
            showBody ? "" : "invisible"
          } ${expanded && !dragging ? "overflow-y-auto overscroll-y-contain" : "overflow-hidden"}`}
        >
          <div ref={bodyInnerRef}>
            <section
              data-facts-section="insight"
              className="scroll-mt-2 border-t border-white/10 pt-3"
            >
              <p className="mb-2 font-mono text-[10px] tracking-[0.2em] uppercase text-gold">
                Insight
              </p>
              {insight}
            </section>
            <section
              data-facts-section="details"
              className="scroll-mt-2 mt-4 border-t border-white/10 pt-3"
            >
              <p className="mb-2 font-mono text-[10px] tracking-[0.2em] uppercase text-gold">
                Details
              </p>
              {details}
            </section>
            <section
              data-facts-section="if"
              className="scroll-mt-2 mt-4 border-t border-white/10 pt-3"
            >
              <p className="mb-2 font-mono text-[10px] tracking-[0.2em] uppercase text-gold">
                What if
              </p>
              {everOpened ? (
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
    </div>
  );
}
