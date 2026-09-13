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
  const arrow = !active ? "↕" : dir === "asc" ? "↑" : "↓";
  return (
    <th className={className ?? TH} title={title}>
      <button
        type="button"
        onClick={() => onSort(column)}
        className={`inline-flex items-center gap-1 bg-transparent p-0 m-0 border-0 cursor-pointer font-mono text-[10px] tracking-[0.14em] uppercase ${
          active ? "text-navy" : "text-charcoal/40 hover:text-navy"
        }`}
        aria-label={`Sort by ${label}${active ? `, ${dir}ending` : ""}`}
      >
        {label}
        <span aria-hidden className="text-[9px] tracking-normal">
          {arrow}
        </span>
      </button>
    </th>
  );
}
