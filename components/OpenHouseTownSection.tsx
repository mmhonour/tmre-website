"use client";

import { useId, useState, type ReactNode } from "react";

export type OpenHouseTownOrganize = {
  canMoveUp: boolean;
  canMoveDown: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  dragging?: boolean;
  dragOver?: boolean;
  onDragStart?: () => void;
  onDragOver?: () => void;
  onDragLeave?: () => void;
  onDrop?: () => void;
  onDragEnd?: () => void;
};

export function OpenHouseTownSection({
  town,
  propertyCount,
  defaultOpen = false,
  open: openProp,
  onOpenChange,
  organize,
  children,
}: {
  town: string;
  propertyCount: number;
  /** Default is collapsed (the +). */
  defaultOpen?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  organize?: OpenHouseTownOrganize;
  children: ReactNode;
}) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(defaultOpen);
  const open = onOpenChange ? Boolean(openProp) : uncontrolledOpen;
  const panelId = useId();
  const homes = propertyCount === 1 ? "1 home" : `${propertyCount} homes`;

  const setOpen = (next: boolean) => {
    if (onOpenChange) onOpenChange(next);
    else setUncontrolledOpen(next);
  };

  return (
    <section
      onDragOver={
        organize
          ? (event) => {
              event.preventDefault();
              organize.onDragOver?.();
            }
          : undefined
      }
      onDrop={
        organize
          ? (event) => {
              event.preventDefault();
              organize.onDrop?.();
            }
          : undefined
      }
      onDragLeave={organize?.onDragLeave}
      className={
        organize?.dragOver
          ? "rounded-xl ring-2 ring-gold/50 ring-offset-2 ring-offset-cream"
          : undefined
      }
    >
      <div className="mb-4 flex w-full items-center gap-2 sm:gap-3">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen(!open)}
          className="flex min-w-0 flex-1 items-baseline gap-3 text-left"
        >
          <span
            className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-charcoal/[0.12] bg-white font-mono text-base leading-none text-navy"
            aria-hidden
          >
            {open ? "−" : "+"}
          </span>
          <h3 className="font-serif text-2xl text-navy">{town}</h3>
          <span className="font-mono text-sm tabular-nums text-slate">{propertyCount}</span>
          <span className="sr-only">
            {homes} with an open house this week. {open ? "Collapse" : "Expand"}.
          </span>
        </button>
        {organize ? (
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              aria-label={`Move ${town} up`}
              disabled={!organize.canMoveUp}
              onClick={organize.onMoveUp}
              className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-charcoal/[0.12] bg-white font-mono text-xs text-navy disabled:opacity-30"
            >
              ↑
            </button>
            <button
              type="button"
              aria-label={`Move ${town} down`}
              disabled={!organize.canMoveDown}
              onClick={organize.onMoveDown}
              className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-charcoal/[0.12] bg-white font-mono text-xs text-navy disabled:opacity-30"
            >
              ↓
            </button>
            <button
              type="button"
              draggable
              aria-label={`Drag to reorder ${town}`}
              title="Drag to reorder"
              onDragStart={(event) => {
                event.dataTransfer.effectAllowed = "move";
                event.dataTransfer.setData("text/plain", town);
                organize.onDragStart?.();
              }}
              onDragEnd={organize.onDragEnd}
              className={`inline-flex h-7 w-7 cursor-grab items-center justify-center rounded-md border border-charcoal/[0.12] bg-white text-navy/70 active:cursor-grabbing ${
                organize.dragging ? "opacity-40" : ""
              }`}
            >
              <span aria-hidden className="font-mono text-[10px] leading-none">
                ⋮⋮
              </span>
            </button>
          </div>
        ) : null}
      </div>
      {open ? <div id={panelId}>{children}</div> : null}
    </section>
  );
}
