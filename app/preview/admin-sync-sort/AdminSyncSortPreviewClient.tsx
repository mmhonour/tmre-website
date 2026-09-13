"use client";

import { useState } from "react";
import AdminSyncSortTh from "@/components/admin/AdminSyncSortTh";
import { formatAdminSyncTimeOnly } from "@/lib/admin-sync-schedule-format";
import {
  applyFrozenAdminSyncRowOrder,
  nextAdminSyncColumnSort,
  snapshotAdminSyncSortIds,
  type AdminSyncColumnSortDir,
  type AdminSyncColumnSortKey,
} from "@/lib/admin-sync-table-sort";
import {
  SYNC_SCHEDULE_FREQUENCIES,
  frequencyLabel,
  type SyncScheduleFrequencyId,
} from "@/lib/sync-schedule-config-shared";

type FixtureRow = {
  id: string;
  label: string;
  order: number;
  frequency: SyncScheduleFrequencyId;
  startIso: string | null;
  endIso: string | null;
  nextIso: string | null;
};

function isoHoursAgo(hours: number): string {
  return new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
}

function isoHoursAhead(hours: number): string {
  return new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
}

const INITIAL_ROWS: FixtureRow[] = [
  {
    id: "weekly",
    label: "Market digest",
    order: 1,
    frequency: "weekly",
    startIso: isoHoursAgo(30),
    endIso: isoHoursAgo(29.5),
    nextIso: isoHoursAhead(90),
  },
  {
    id: "15m",
    label: "Incremental",
    order: 2,
    frequency: "15m",
    startIso: isoHoursAgo(0.2),
    endIso: isoHoursAgo(0.1),
    nextIso: isoHoursAhead(0.15),
  },
  {
    id: "2h",
    label: "Stats cache",
    order: 3,
    frequency: "2h",
    startIso: isoHoursAgo(3),
    endIso: isoHoursAgo(2.4),
    nextIso: isoHoursAhead(1.2),
  },
  {
    id: "daily",
    label: "Deal of the day",
    order: 4,
    frequency: "daily",
    startIso: isoHoursAgo(20),
    endIso: isoHoursAgo(19.8),
    nextIso: isoHoursAhead(8),
  },
  {
    id: "30m",
    label: "Open houses",
    order: 5,
    frequency: "30m",
    startIso: isoHoursAgo(0.8),
    endIso: isoHoursAgo(0.6),
    nextIso: isoHoursAhead(0.4),
  },
  {
    id: "monthly",
    label: "CAMA tax",
    order: 6,
    frequency: "monthly",
    startIso: isoHoursAgo(200),
    endIso: isoHoursAgo(198),
    nextIso: isoHoursAhead(400),
  },
  {
    id: "event",
    label: "FOMC",
    order: 7,
    frequency: "event",
    startIso: null,
    endIso: null,
    nextIso: isoHoursAhead(48),
  },
];

function metaFor(row: FixtureRow) {
  return {
    id: row.id,
    frequency: row.frequency,
    startMs: row.startIso ? Date.parse(row.startIso) : null,
    endMs: row.endIso ? Date.parse(row.endIso) : null,
    nextMs: row.nextIso ? Date.parse(row.nextIso) : null,
    order: row.order,
  };
}

export default function AdminSyncSortPreviewClient() {
  const [rows, setRows] = useState(INITIAL_ROWS);
  const [sortKey, setSortKey] = useState<AdminSyncColumnSortKey | null>(null);
  const [sortDir, setSortDir] = useState<AdminSyncColumnSortDir>("asc");
  const [sortedRowIds, setSortedRowIds] = useState<string[] | null>(null);

  const visible = applyFrozenAdminSyncRowOrder(rows, sortedRowIds);

  const onSort = (column: AdminSyncColumnSortKey) => {
    const next = nextAdminSyncColumnSort(sortKey, sortDir, column);
    setSortKey(next.key);
    setSortDir(next.dir);
    setSortedRowIds(
      snapshotAdminSyncSortIds(rows.map(metaFor), next.key, next.dir),
    );
  };

  return (
    <div className="min-h-screen bg-cream">
      <div className="mx-auto max-w-4xl px-4 pb-12 pt-28 sm:px-6">
        <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.2em] text-gold">
          UI preview
        </p>
        <h1 className="mb-2 font-serif text-3xl text-navy">
          Admin sync column sort
        </h1>
        <p className="mb-6 text-sm leading-relaxed text-slate">
          Sortable headings are links. The sorted column shows a single arrow
          to the left of the label (up = ASC, down = DESC). Changing Frequency
          in a row does not move that row until you click a heading again.
          Fixture rows — not the live sync table.
        </p>
        <div className="overflow-x-auto rounded-2xl border border-charcoal/[0.08] bg-white">
          <table className="w-full border-collapse text-sm text-navy">
            <thead>
              <tr>
                <AdminSyncSortTh
                  column="order"
                  label="Order"
                  activeKey={sortKey}
                  dir={sortDir}
                  onSort={onSort}
                />
                <th className="px-3 py-2 text-left font-mono text-[10px] tracking-[0.14em] uppercase text-charcoal/40">
                  Job
                </th>
                <AdminSyncSortTh
                  column="frequency"
                  label="Frequency"
                  activeKey={sortKey}
                  dir={sortDir}
                  onSort={onSort}
                />
                <AdminSyncSortTh
                  column="start"
                  label="Start (ET)"
                  activeKey={sortKey}
                  dir={sortDir}
                  onSort={onSort}
                />
                <AdminSyncSortTh
                  column="end"
                  label="End (ET)"
                  activeKey={sortKey}
                  dir={sortDir}
                  onSort={onSort}
                />
                <AdminSyncSortTh
                  column="next"
                  label="Next (ET)"
                  activeKey={sortKey}
                  dir={sortDir}
                  onSort={onSort}
                />
              </tr>
            </thead>
            <tbody>
              {visible.map((row) => (
                <tr key={row.id} className="border-t border-charcoal/[0.06]">
                  <td className="px-3 py-2 font-mono text-xs">{row.order}</td>
                  <td className="px-3 py-2">{row.label}</td>
                  <td className="px-3 py-2">
                    <select
                      aria-label={`Frequency for ${row.label}`}
                      className="rounded border border-charcoal/15 bg-white px-1.5 py-1 text-sm"
                      value={row.frequency}
                      onChange={(event) => {
                        const frequency = event.target
                          .value as SyncScheduleFrequencyId;
                        setRows((current) =>
                          current.map((item) =>
                            item.id === row.id ? { ...item, frequency } : item,
                          ),
                        );
                      }}
                    >
                      {SYNC_SCHEDULE_FREQUENCIES.map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-2">
                    {formatAdminSyncTimeOnly(row.startIso)}
                  </td>
                  <td className="px-3 py-2">
                    {formatAdminSyncTimeOnly(row.endIso)}
                  </td>
                  <td className="px-3 py-2">
                    {formatAdminSyncTimeOnly(row.nextIso)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.14em] text-charcoal/40">
          {sortKey
            ? `Sorted by ${sortKey} ${sortDir} — frozen until the next heading click`
            : `Unsorted fixture order — ${frequencyLabel("15m")} sits below Weekly until you click Frequency`}
        </p>
      </div>
    </div>
  );
}
