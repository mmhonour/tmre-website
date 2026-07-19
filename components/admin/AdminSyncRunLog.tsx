"use client";

import { useEffect, useState } from "react";
import {
  ADMIN_SYNC_RUN_LOG_EVENT,
  ADMIN_SYNC_RUN_LOG_STORAGE_KEY,
  formatRunClock,
  formatRunDuration,
  parseStoredSyncRunLog,
  type AdminSyncRunLogEvent,
  type SyncRunLogSnapshot,
} from "@/components/admin/AdminSyncTable";

/**
 * Sync run log — rendered at the bottom of the DB tab. Shows sync type, start /
 * end / elapsed, plus every step's status and duration for the most recent sync.
 *
 * The log is owned by AdminSyncTable (which persists it to localStorage and
 * broadcasts updates on the `admin-sync-run-log` window event). This panel is a
 * read-only mirror: it hydrates from localStorage on mount, then follows the
 * broadcast so it updates live during a run. The previous run stays visible until
 * a new run finishes.
 */
export default function AdminSyncRunLog() {
  const [snapshot, setSnapshot] = useState<SyncRunLogSnapshot | null>(null);
  const [running, setRunning] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    try {
      const raw = localStorage.getItem(ADMIN_SYNC_RUN_LOG_STORAGE_KEY);
      if (raw) setSnapshot(parseStoredSyncRunLog(raw));
    } catch {
      /* ignore */
    }
    const onLog = (event: Event) => {
      const detail = (event as CustomEvent<AdminSyncRunLogEvent>).detail;
      if (!detail) return;
      setSnapshot(detail.snapshot);
      setRunning(detail.running);
    };
    window.addEventListener(ADMIN_SYNC_RUN_LOG_EVENT, onLog as EventListener);
    return () =>
      window.removeEventListener(ADMIN_SYNC_RUN_LOG_EVENT, onLog as EventListener);
  }, []);

  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [running]);

  const entries = snapshot?.entries ?? [];
  const startMs = snapshot ? Date.parse(snapshot.startedAt) : NaN;
  const endMs = snapshot?.finishedAt ? Date.parse(snapshot.finishedAt) : NaN;
  const elapsedMs = Number.isFinite(startMs)
    ? (Number.isFinite(endMs) ? endMs : nowMs) - startMs
    : null;
  const errorCount = entries.filter((e) => e.error).length;

  return (
    <div
      id="admin-sync-log"
      className="scroll-mt-24 rounded-2xl border border-charcoal/[0.08] bg-white shadow-sm overflow-hidden"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2 px-5 sm:px-6 py-4 border-b border-charcoal/[0.08] bg-cream/20">
        <div className="min-w-0">
          <p className="font-mono text-[11px] tracking-[0.2em] uppercase text-gold">
            Latest sync steps
          </p>
          <p className="mt-1 text-sm text-slate max-w-2xl">
            Sync type, wall-clock timing, and per-step status from the most recent
            Admin sync in this browser. Incremental runs log one line per status
            bucket (Active / Closed / Expired) with towns glommed. For durable
            Postgres history, see Database sync history above.
          </p>
        </div>
        <p className="font-mono text-[10px] text-charcoal/45 shrink-0">
          {!snapshot
            ? "no run recorded yet"
            : `${entries.length} step${entries.length === 1 ? "" : "s"}${
                errorCount > 0
                  ? ` · ${errorCount} error${errorCount === 1 ? "" : "s"}`
                  : ""
              }${running ? " · running…" : ""}`}
        </p>
      </div>

      {snapshot ? (
        <div className="px-5 sm:px-6 py-3 border-b border-charcoal/[0.06] bg-white">
          <dl className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-2">
            <div className="min-w-0">
              <dt className="font-mono text-[9px] tracking-[0.14em] uppercase text-charcoal/40">
                Type
              </dt>
              <dd className="mt-0.5 font-mono text-[11px] text-navy font-semibold truncate">
                {snapshot.syncType}
              </dd>
            </div>
            <div className="min-w-0">
              <dt className="font-mono text-[9px] tracking-[0.14em] uppercase text-charcoal/40">
                Started
              </dt>
              <dd className="mt-0.5 font-mono text-[11px] tabular-nums text-slate">
                {formatRunClock(snapshot.startedAt)}
              </dd>
            </div>
            <div className="min-w-0">
              <dt className="font-mono text-[9px] tracking-[0.14em] uppercase text-charcoal/40">
                Ended
              </dt>
              <dd className="mt-0.5 font-mono text-[11px] tabular-nums text-slate">
                {running ? "—" : formatRunClock(snapshot.finishedAt)}
              </dd>
            </div>
            <div className="min-w-0">
              <dt className="font-mono text-[9px] tracking-[0.14em] uppercase text-charcoal/40">
                Elapsed
              </dt>
              <dd className="mt-0.5 font-mono text-[11px] tabular-nums text-navy font-semibold">
                {formatRunDuration(elapsedMs)}
                {running ? "…" : ""}
              </dd>
            </div>
          </dl>
        </div>
      ) : null}

      <div className="px-5 sm:px-6 py-4">
        {!snapshot ? (
          <p className="text-sm text-slate/70">
            Run a sync (single step, Sync all, or a full resync) and each step&apos;s
            result and duration will be listed here.
          </p>
        ) : entries.length === 0 ? (
          <p className="text-sm text-slate/70">
            {running ? "Waiting for the first step…" : "No steps were recorded."}
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
                <p className="mt-0.5 font-mono text-[10px] tabular-nums text-charcoal/40">
                  {formatRunClock(entry.startedAt)}
                  {" → "}
                  {formatRunClock(entry.finishedAt)}
                </p>
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
