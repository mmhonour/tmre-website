"use client";

import { useId, useState, type ReactNode } from "react";

export function OpenHouseTownSection({
  town,
  propertyCount,
  defaultOpen = true,
  children,
}: {
  town: string;
  propertyCount: number;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const panelId = useId();
  const homes = propertyCount === 1 ? "1 home" : `${propertyCount} homes`;

  return (
    <section>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}
        className="mb-4 flex w-full items-baseline gap-3 text-left"
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
      {open ? <div id={panelId}>{children}</div> : null}
    </section>
  );
}
