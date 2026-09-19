"use client";

import { useMemo, useState } from "react";
import IntelSortDrawer from "@/components/intelligence/IntelSortDrawer";
import type { MarketPulseSelectOption } from "@/components/MarketPulseSelectMenu";

export type MarketPulseFilterTabId = "type" | "tracing" | "lookback";

const TAB_LABEL: Record<MarketPulseFilterTabId, string> = {
  type: "Type",
  tracing: "Tracing",
  lookback: "Lookback",
};

type TabSpec<Id extends string> = {
  id: MarketPulseFilterTabId;
  value: Id;
  options: readonly MarketPulseSelectOption<Id>[];
  onChange: (id: Id) => void;
};

/**
 * One FILTER chip on Market Pulse mobile. Type, tracing (Off / WoW / MoM /
 * YoY), and lookback share a right-hand drawer with tabs so the floating bar
 * does not wrap three menus. The drawer stays open across picks until Hide.
 */
export default function MarketPulseFilterMenu({
  typeValue,
  typeOptions,
  onTypeChange,
  tracingValue,
  tracingOptions,
  onTracingChange,
  lookbackValue,
  lookbackOptions,
  onLookbackChange,
  className,
}: {
  typeValue?: string;
  typeOptions?: readonly MarketPulseSelectOption<string>[];
  onTypeChange?: (id: string) => void;
  tracingValue?: string;
  tracingOptions?: readonly MarketPulseSelectOption<string>[];
  onTracingChange?: (id: string) => void;
  lookbackValue?: string;
  lookbackOptions?: readonly MarketPulseSelectOption<string>[];
  onLookbackChange?: (id: string) => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const tabs = useMemo(() => {
    const next: TabSpec<string>[] = [];
    if (typeOptions?.length && typeValue != null && onTypeChange) {
      next.push({
        id: "type",
        value: typeValue,
        options: typeOptions,
        onChange: onTypeChange,
      });
    }
    if (tracingOptions?.length && tracingValue != null && onTracingChange) {
      next.push({
        id: "tracing",
        value: tracingValue,
        options: tracingOptions,
        onChange: onTracingChange,
      });
    }
    if (lookbackOptions?.length && lookbackValue != null && onLookbackChange) {
      next.push({
        id: "lookback",
        value: lookbackValue,
        options: lookbackOptions,
        onChange: onLookbackChange,
      });
    }
    return next;
  }, [
    typeOptions,
    typeValue,
    onTypeChange,
    tracingOptions,
    tracingValue,
    onTracingChange,
    lookbackOptions,
    lookbackValue,
    onLookbackChange,
  ]);

  const [tab, setTab] = useState<MarketPulseFilterTabId>("type");
  const active = tabs.find((t) => t.id === tab) ?? tabs[0];

  if (!active) return null;

  return (
    <div className={className}>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label="Filter property type, tracing, and lookback"
        className="inline-flex items-center gap-1.5 rounded-full border border-[var(--mp-text)]/20 bg-[var(--mp-card-bg,#fff)] px-2.5 py-1 shadow-[0_1px_0_0_rgba(28,42,58,0.1)] transition-[box-shadow,border-color] hover:border-[var(--mp-text)]/35"
      >
        <svg
          viewBox="0 0 12 12"
          className="h-2.5 w-2.5 shrink-0 text-[var(--mp-text)]/70"
          fill="currentColor"
          aria-hidden
        >
          <path d="M8.5 1.2 L2.8 6 L8.5 10.8 Z" />
        </svg>
        <span className="[font-family:var(--mp-mono-font)] text-[10px] uppercase tracking-[0.14em] text-[var(--mp-text)]">
          Filter
        </span>
      </button>
      <IntelSortDrawer
        open={open}
        onClose={() => setOpen(false)}
        title="Filter"
        ariaLabel="Market Pulse filters"
      >
        {tabs.length > 1 ? (
          <div
            className="mb-3 flex gap-1"
            role="tablist"
            aria-label="Filter section"
          >
            {tabs.map((t) => {
              const selected = t.id === active.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  onClick={() => setTab(t.id)}
                  className={`min-w-0 flex-1 rounded-sm px-2 py-1.5 [font-family:var(--mp-mono-font)] text-[10px] uppercase tracking-[0.14em] transition-colors ${
                    selected
                      ? "bg-navy text-white"
                      : "bg-white text-navy/70 hover:text-navy"
                  }`}
                >
                  {TAB_LABEL[t.id]}
                </button>
              );
            })}
          </div>
        ) : null}
        <div className="space-y-2" role="tabpanel" aria-label={TAB_LABEL[active.id]}>
          {active.options.map((opt) => {
            const selected = opt.id === active.value;
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => active.onChange(opt.id)}
                aria-pressed={selected}
                className={`flex w-full items-center rounded-xl border px-3.5 py-3 text-left transition-colors ${
                  selected
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
