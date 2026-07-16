"use client";

import { useEffect, useState } from "react";
import {
  ADMIN_SYNC_RUN_LOG_EVENT,
  ADMIN_SYNC_RUN_LOG_STORAGE_KEY,
  formatRunDuration,
  type AdminSyncRunLogEvent,
  type SyncRunLogEntry,
} from "@/components/admin/AdminSyncTable";

/**
 * Sync run log — rendered at the bottom of the DB tab. Shows every step's status
 * and duration for the most recent sync so timings and errors can be reviewed.
 *
 * The log is owned by AdminSyncTable (which persists it to localStorage and
 * broadcasts updates on the `admin-sync-run-log` window event). This panel is a
 * read-only mirror: it hydrates from localStorage on mount, then follows the
 * broadcast so it updates live during a run. The previous run stays visible until
 * a new run finishes.
 */
export default function AdminSyncRunLog() {
  const [entries, setEntries] = useState<SyncRunLogEntry[]>([]);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(ADMIN_SYNC_RUN_LOG_STORAGE_KEY);
      if (raw) setEntries(JSON.parse(raw) as SyncRunLogEntry[]);
    } catch {
      /* ignore */
    }
    const onLog = (event: Event) => {
      const detail = (event as CustomEvent<AdminSyncRunLogEvent>).detail;
      if (!detail) return;
      setEntries(detail.entries);
      setRunning(detail.running);
    };
    window.addEventListener(ADMIN_SYNC_RUN_LOG_EVENT, onLog as EventListener);
    return () => window.removeEventListener(ADMIN_SYNC_RUN_LOG_EVENT, onLog as EventListener);
  }, []);

  const totalMs = entries.reduce((sum, e) => sum + (e.durationMs ?? 0), 0);
  const errorCount = entries.filter((e) => e.error).length;

  return (
    <div
      id="admin-sync-log"
      className="scroll-mt-24 rounded-2xl border border-charcoal/[0.08] bg-white shadow-sm overflow-hidden"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2 px-5 sm:px-6 py-4 border-b border-charcoal/[0.08] bg-cream/20">
        <div className="min-w-0">
          <p className="font-mono text-[11px] tracking-[0.2em] uppercase text-gold">
            Sync run log
          </p>
          <p className="mt-1 text-sm text-slate max-w-2xl">
            Per-step status and timing from the most recent sync — review how long each town and
            finalize step took, plus any errors. Kept until the next run finishes.
          </p>
        </div>
        <p className="font-mono text-[10px] text-charcoal/45 shrink-0">
          {entries.length === 0
            ? "no run recorded yet"
            : `${entries.length} step${entries.length === 1 ? "" : "s"} · ${formatRunDuration(totalMs)} total${
                errorCount > 0 ? ` · ${errorCount} error${errorCount === 1 ? "" : "s"}` : ""
              }${running ? " · running…" : ""}`}
        </p>
      </div>
      <div className="px-5 sm:px-6 py-4">
        {entries.length === 0 ? (
          <p className="text-sm text-slate/70">
            Run a sync (single step, Sync all, or a full resync) and each step&apos;s result and
            duration will be listed here.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {entries.map((entry) => (
              <li
                key={entry.id}
                className={`rounded-lg border px-3 py-2 ${
                  entry.error
                    ? "border-rose-200 bg-rose-50/70"
                    : "border-charcoal/[0.08] bg-cream/10"
                }`}
              >
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                  <span className="font-mono text-[11px] tracking-[0.08em] text-navy font-semibold">
                    {entry.label}
                  </span>
                  <span
                    className={`font-mono text-[10px] tabular-nums ${
                      entry.error ? "text-rose-700" : "text-charcoal/50"
                    }`}
                  >
                    {formatRunDuration(entry.durationMs)}
                  </span>
                </div>
                <p
                  className={`mt-0.5 font-mono text-[10px] leading-snug break-words whitespace-pre-line ${
                    entry.error ? "text-rose-700" : "text-slate"
                  }`}
                >
                  {entry.error ?? entry.status}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
