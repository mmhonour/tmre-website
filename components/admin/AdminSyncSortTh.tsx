"use client";

import type {
  AdminSyncColumnSortDir,
  AdminSyncColumnSortKey,
} from "@/lib/admin-sync-table-sort";

const TH =
  "px-3 py-2 text-left font-mono text-[10px] tracking-[0.14em] uppercase text-charcoal/40 border-r border-b border-transparent bg-cream/30 whitespace-nowrap";

export default function AdminSyncSortTh({
  column,
  label,
  title,
  activeKey,
  dir,
  onSort,
  className,
}: {
  column: AdminSyncColumnSortKey;
  label: string;
  title?: string;
  activeKey: AdminSyncColumnSortKey | null;
  dir: AdminSyncColumnSortDir;
  onSort: (column: AdminSyncColumnSortKey) => void;
  className?: string;
}) {
  const active = activeKey === column;
  const arrow = dir === "asc" ? "↑" : "↓";
  return (
    <th
      className={className ?? TH}
      title={title}
      aria-sort={
        active ? (dir === "asc" ? "ascending" : "descending") : "none"
      }
    >
      <a
        href={`#sort-${column}`}
        onClick={(event) => {
          event.preventDefault();
          onSort(column);
        }}
        className={`inline-flex items-center gap-1 font-mono text-[10px] tracking-[0.14em] uppercase no-underline ${
          active ? "text-navy" : "text-navy/70 hover:text-navy"
        }`}
        aria-label={`Sort by ${label}${active ? `, ${dir}ending` : ""}`}
      >
        {active ? (
          <span aria-hidden className="w-2.5 shrink-0 text-[9px] tracking-normal">
            {arrow}
          </span>
        ) : (
          <span className="w-2.5 shrink-0" aria-hidden />
        )}
        <span className="underline underline-offset-2 decoration-navy/35 hover:decoration-navy">
          {label}
        </span>
      </a>
    </th>
  );
}
