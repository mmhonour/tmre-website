"use client";

import { useState } from "react";
import IntelSortDrawer from "@/components/intelligence/IntelSortDrawer";

export type MarketPulseSelectOption<Id extends string> = {
  id: Id;
  label: string;
};

/**
 * Intelligence-style chip that opens a right-hand option drawer.
 * Used on Market Pulse mobile so property type and lookback do not wrap
 * across the floating bar.
 */
export default function MarketPulseSelectMenu<Id extends string>({
  title,
  value,
  options,
  onChange,
  className,
}: {
  title: string;
  value: Id;
  options: readonly MarketPulseSelectOption<Id>[];
  onChange: (id: Id) => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const current = options.find((opt) => opt.id === value)?.label ?? value;

  return (
    <div className={className}>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={`${title} — currently ${current}`}
        className="inline-flex max-w-[11.5rem] min-w-0 items-center gap-1.5 rounded-full border border-[var(--mp-text)]/20 bg-[var(--mp-card-bg,#fff)] px-2.5 py-1 shadow-[0_1px_0_0_rgba(28,42,58,0.1)] transition-[box-shadow,border-color] hover:border-[var(--mp-text)]/35"
      >
        <svg
          viewBox="0 0 12 12"
          className="h-2.5 w-2.5 shrink-0 text-[var(--mp-text)]/70"
          fill="currentColor"
          aria-hidden
        >
          <path d="M8.5 1.2 L2.8 6 L8.5 10.8 Z" />
        </svg>
        <span className="shrink-0 [font-family:var(--mp-mono-font)] text-[10px] uppercase tracking-[0.14em] text-[var(--mp-muted-text)]">
          {title}
        </span>
        <span className="truncate [font-family:var(--mp-mono-font)] text-[10px] uppercase tracking-[0.12em] text-[var(--mp-text)]">
          {current}
        </span>
      </button>
      <IntelSortDrawer
        open={open}
        onClose={() => setOpen(false)}
        title={title}
        ariaLabel={title}
      >
        <div className="space-y-2">
          {options.map((opt) => {
            const active = opt.id === value;
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => {
                  setOpen(false);
                  onChange(opt.id);
                }}
                aria-pressed={active}
                className={`flex w-full items-center rounded-xl border px-3.5 py-3 text-left transition-colors ${
                  active
                    ? "border-navy/30 bg-navy text-white shadow-sm"
                    : "border-charcoal/[0.08] bg-white text-navy hover:border-navy/25"
                }`}
              >
                <span className="font-mono text-[11px] uppercase tracking-[0.14em]">
                  {opt.label}
                </span>
              </button>
            );
          })}
        </div>
      </IntelSortDrawer>
    </div>
  );
}
