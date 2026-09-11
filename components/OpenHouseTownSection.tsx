"use client";

import { useId, useState, type ReactNode } from "react";

export function OpenHouseTownSection({
  town,
  propertyCount,
  defaultOpen = false,
  open: openProp,
  onOpenChange,
  children,
}: {
  town: string;
  propertyCount: number;
  /** Default is collapsed (the +). */
  defaultOpen?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
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
    <section>
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
      </div>
      {open ? <div id={panelId}>{children}</div> : null}
    </section>
  );
}
