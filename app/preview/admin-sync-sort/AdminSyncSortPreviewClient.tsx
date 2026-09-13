"use client";

import { useMemo, useState } from "react";
import AdminSyncSortTh from "@/components/admin/AdminSyncSortTh";
import {
  formatAdminSyncTimeOnly,
} from "@/lib/admin-sync-schedule-format";
import {
  compareAdminSyncRowSortMeta,
  nextAdminSyncColumnSort,
  type AdminSyncColumnSortDir,
  type AdminSyncColumnSortKey,
} from "@/lib/admin-sync-table-sort";
import {
  frequencyLabel,
  type SyncScheduleFrequencyId,
} from "@/lib/sync-schedule-config-shared";

type FixtureRow = {
  id: string;
  label: string;
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

/** Labels that would sort A–Z as 15 mins, 2 hours, 30 mins, Daily, Weekly. */
const FIXTURE_ROWS: FixtureRow[] = [
  {
    id: "weekly",
    label: "Market digest",
    frequency: "weekly",
    startIso: isoHoursAgo(30),
    endIso: isoHoursAgo(29.5),
    nextIso: isoHoursAhead(90),
  },
  {
    id: "15m",
    label: "Incremental",
    frequency: "15m",
    startIso: isoHoursAgo(0.2),
    endIso: isoHoursAgo(0.1),
    nextIso: isoHoursAhead(0.15),
  },
  {
    id: "2h",
    label: "Stats cache",
    frequency: "2h",
    startIso: isoHoursAgo(3),
    endIso: isoHoursAgo(2.4),
    nextIso: isoHoursAhead(1.2),
  },
  {
    id: "daily",
    label: "Deal of the day",
    frequency: "daily",
    startIso: isoHoursAgo(20),
    endIso: isoHoursAgo(19.8),
    nextIso: isoHoursAhead(8),
  },
  {
    id: "30m",
    label: "Open houses",
    frequency: "30m",
    startIso: isoHoursAgo(0.8),
    endIso: isoHoursAgo(0.6),
    nextIso: isoHoursAhead(0.4),
  },
  {
    id: "monthly",
    label: "CAMA tax",
    frequency: "monthly",
    startIso: isoHoursAgo(200),
    endIso: isoHoursAgo(198),
    nextIso: isoHoursAhead(400),
  },
  {
    id: "event",
    label: "FOMC",
    frequency: "event",
    startIso: null,
    endIso: null,
    nextIso: isoHoursAhead(48),
  },
];

export default function AdminSyncSortPreviewClient() {
  const [sortKey, setSortKey] = useState<AdminSyncColumnSortKey | null>(null);
  const [sortDir, setSortDir] = useState<AdminSyncColumnSortDir>("asc");

  const rows = useMemo(() => {
    const next = [...FIXTURE_ROWS];
    if (!sortKey) return next;
    return next.sort((a, b) =>
      compareAdminSyncRowSortMeta(
        {
          frequency: a.frequency,
          startMs: a.startIso ? Date.parse(a.startIso) : null,
          endMs: a.endIso ? Date.parse(a.endIso) : null,
          nextMs: a.nextIso ? Date.parse(a.nextIso) : null,
        },
        {
          frequency: b.frequency,
          startMs: b.startIso ? Date.parse(b.startIso) : null,
          endMs: b.endIso ? Date.parse(b.endIso) : null,
          nextMs: b.nextIso ? Date.parse(b.nextIso) : null,
        },
        sortKey,
        sortDir,
      ),
    );
  }, [sortKey, sortDir]);

  const onSort = (column: AdminSyncColumnSortKey) => {
    const next = nextAdminSyncColumnSort(sortKey, sortDir, column);
    setSortKey(next.key);
    setSortDir(next.dir);
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
          Click Frequency, Start, End, or Next. Frequency is shortest cadence
          to longest (15 mins before 2 hours before Daily), not A–Z of the
          label. Start / End / Next use the clock, not the printed string.
          Fixture rows — not the live sync table.
        </p>
        <div className="overflow-x-auto rounded-2xl border border-charcoal/[0.08] bg-white">
          <table className="w-full border-collapse text-sm text-navy">
            <thead>
              <tr>
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
              {rows.map((row) => (
                <tr key={row.id} className="border-t border-charcoal/[0.06]">
                  <td className="px-3 py-2">{row.label}</td>
                  <td className="px-3 py-2">{frequencyLabel(row.frequency)}</td>
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
      </div>
    </div>
  );
}
