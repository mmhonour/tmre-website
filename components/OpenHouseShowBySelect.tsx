"use client";

import {
  OPEN_HOUSE_SHOW_BY_VALUES,
  type OpenHouseShowBy,
} from "@/lib/open-houses-focus";

const OPTIONS: { value: OpenHouseShowBy; label: string }[] = [
  { value: "off", label: "All" },
  { value: "most", label: "Most open houses" },
  { value: "first", label: "First showing" },
];

export function OpenHouseShowBySelect({
  value,
  onChange,
  id = "oh-show-by",
}: {
  value: OpenHouseShowBy;
  onChange: (value: OpenHouseShowBy) => void;
  id?: string;
}) {
  return (
    <label
      htmlFor={id}
      className="inline-flex h-9 items-center gap-1.5 font-mono text-[10px] tracking-[0.12em] uppercase text-navy"
    >
      <span className="shrink-0 text-navy/55">Show by:</span>
      <span className="relative inline-grid [&>select]:col-start-1 [&>select]:row-start-1">
        <select
          id={id}
          value={value}
          onChange={(event) => {
            const next = event.target.value;
            if ((OPEN_HOUSE_SHOW_BY_VALUES as readonly string[]).includes(next)) {
              onChange(next as OpenHouseShowBy);
            }
          }}
          aria-label="Show by"
          className="h-9 min-w-[8.5rem] cursor-pointer appearance-none rounded-full border border-charcoal/[0.08] bg-white px-3 pr-8 text-[10px] tracking-[0.12em] uppercase text-navy outline-none transition-colors hover:border-charcoal/20 focus:border-gold/50 focus:ring-1 focus:ring-gold/30"
        >
          {OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <span
          className="pointer-events-none absolute inset-y-0 right-2.5 flex items-center text-slate/50"
          aria-hidden
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path
              d="M3 4.5L6 7.5L9 4.5"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
      </span>
    </label>
  );
}
