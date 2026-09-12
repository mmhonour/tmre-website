"use client";

import { useId, useState, type ReactNode } from "react";

export type OpenHouseTownOrganize = {
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
          ? "rounded-lg ring-2 ring-gold/50 ring-offset-2 ring-offset-cream"
          : undefined
      }
    >
      <div className="mb-1 flex w-full items-baseline gap-2">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen(!open)}
          className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-charcoal/[0.12] bg-white font-mono text-sm leading-none text-navy"
        >
          <span aria-hidden>{open ? "−" : "+"}</span>
          <span className="sr-only">
            {homes} with an open house this week. {open ? "Collapse" : "Expand"}.
          </span>
        </button>
        <h3
          draggable={Boolean(organize)}
          onDragStart={
            organize
              ? (event) => {
                  event.dataTransfer.effectAllowed = "move";
                  event.dataTransfer.setData("text/plain", town);
                  organize.onDragStart?.();
                }
              : undefined
          }
          onDragEnd={organize?.onDragEnd}
          className={`min-w-0 font-serif text-2xl text-navy ${
            organize ? "cursor-grab active:cursor-grabbing" : ""
          } ${organize?.dragging ? "opacity-40" : ""}`}
        >
          {town}
        </h3>
        <span className="font-mono text-sm tabular-nums text-slate">{propertyCount}</span>
      </div>
      {open ? <div id={panelId}>{children}</div> : null}
    </section>
  );
}
