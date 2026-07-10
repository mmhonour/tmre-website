"use client";

import { useCallback, useEffect, useState } from "react";

type LockStatus = {
  inProgress: boolean;
  depth: number;
  startedAt: string | null;
  finishedAt: string | null;
  stuck: boolean;
  stuckReason: string | null;
};

type HistoryEntry = {
  id: string;
  source: string | null;
  startedAt: string;
  finishedAt: string | null;
  durationMs: number | null;
  tables: string[];
  clearedManually?: boolean;
};

type HistorySummary = {
  windowMs: number;
  lockCount: number;
  activeCount: number;
  completedCount: number;
  totalHeldMs: number;
  entries: HistoryEntry[];
  allTables: string[];
};

function formatTimestamp(iso: string | null | undefined): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function formatDuration(ms: number | null | undefined): string {
  if (ms == null || ms < 0) return "—";
  if (ms < 1000) return `${ms}ms`;
  const sec = Math.round(ms / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  const remSec = sec % 60;
  if (min < 60) return remSec > 0 ? `${min}m ${remSec}s` : `${min}m`;
  const hr = Math.floor(min / 60);
  const remMin = min % 60;
  return remMin > 0 ? `${hr}h ${remMin}m` : `${hr}h`;
}

function formatSource(source: string | null): string {
  if (!source) return "unknown";
  return source.replace(/-/g, " ");
}

function formatCompactTimestamp(iso: string | null | undefined): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat(undefined, {
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function formatCompactEntry(entry: HistoryEntry): string {
  const when = formatCompactTimestamp(entry.startedAt);
  const source = formatSource(entry.source);
  const duration =
    entry.finishedAt == null && entry.durationMs == null
      ? formatDuration(Date.now() - Date.parse(entry.startedAt))
      : formatDuration(entry.durationMs);
  const tables = entry.tables.length > 0 ? entry.tables.join(", ") : null;
  const flags = [
    entry.finishedAt == null ? "active" : null,
    entry.clearedManually ? "cleared" : null,
  ].filter(Boolean);
  const tail = [duration, tables, ...flags].filter(Boolean).join(" · ");
  return `${when} · ${source} · ${tail}`;
}

function formatTables(tables: string[]): string {
  if (tables.length === 0) return "—";
  return tables.join(", ");
}

function RefreshLogCompact({
  entries,
  windowHours,
}: {
  entries: HistoryEntry[];
  windowHours: number;
}) {
  return (
    <div className="px-5 sm:px-6 py-3 border-t border-charcoal/[0.08] bg-white">
      <p className="font-mono text-[9px] tracking-[0.16em] uppercase text-charcoal/40 mb-2">
        Refresh log · last {windowHours}h
      </p>
      {entries.length > 0 ? (
        <ul className="max-h-52 overflow-y-auto space-y-1 font-mono text-[10px] leading-relaxed text-charcoal/75">
          {entries.map((entry) => (
            <li
              key={entry.id}
              className={`tabular-nums truncate ${
                entry.finishedAt == null
                  ? "text-gold"
                  : entry.clearedManually
                    ? "text-coral/80"
                    : ""
              }`}
              title={formatCompactEntry(entry)}
            >
              {formatCompactEntry(entry)}
            </li>
          ))}
        </ul>
      ) : (
        <p className="font-mono text-[10px] text-charcoal/50">
          No refreshes in the last {windowHours} hours.
        </p>
      )}
    </div>
  );
}

export default function AdminRefreshLockPanel({
  initialLock,
  initialHistory,
}: {
  initialLock: LockStatus;
  initialHistory: HistorySummary;
}) {
  const [lock, setLock] = useState(initialLock);
  const [history, setHistory] = useState(initialHistory);
  const [clearing, setClearing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const refreshLock = useCallback(async () => {
    const res = await fetch("/api/admin/refresh-lock", { cache: "no-store" });
    if (!res.ok) return;
    const body = (await res.json()) as { lock: LockStatus; history: HistorySummary };
    setLock(body.lock);
    if (body.history) setHistory(body.history);
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => void refreshLock(), 15_000);
    return () => window.clearInterval(id);
  }, [refreshLock]);

  const clearLock = async () => {
    setClearing(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/refresh-lock", { method: "POST" });
      const body = (await res.json()) as {
        ok?: boolean;
        cleared?: boolean;
        message?: string;
        lock?: LockStatus;
        history?: HistorySummary;
        error?: string;
      };
      if (!res.ok) {
        setMessage(body.error ?? "Failed to clear lock");
        return;
      }
      if (body.lock) setLock(body.lock);
      if (body.history) setHistory(body.history);
      setMessage(body.message ?? (body.cleared ? "Lock cleared" : "No lock held"));
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Failed to clear lock");
    } finally {
      setClearing(false);
    }
  };

  const lockHeld = lock.inProgress || lock.depth > 0;
  const showClear = lockHeld && (lock.stuck || lock.inProgress);
  const windowHours = Math.round(history.windowMs / (60 * 60 * 1000));

  return (
    <div className="mt-6 overflow-hidden rounded-2xl border border-charcoal/[0.08] bg-white shadow-sm shadow-charcoal/[0.04]">
      <div className="px-5 sm:px-6 py-4 border-b border-charcoal/[0.08] bg-cream/40">
        <p className="font-mono text-[11px] tracking-[0.2em] uppercase text-gold">
          Refresh lock
        </p>
        <p className="mt-2 text-sm text-slate leading-relaxed max-w-2xl">
          Last {windowHours} hours:{" "}
          <span className="font-mono tabular-nums text-navy font-semibold">
            {history.lockCount}
          </span>{" "}
          lock{history.lockCount === 1 ? "" : "s"}
          {history.lockCount > 0 ? (
            <>
              {" "}
              ·{" "}
              <span className="font-mono tabular-nums text-navy font-semibold">
                {formatDuration(history.totalHeldMs)}
              </span>{" "}
              total held
            </>
          ) : null}
          {history.allTables.length > 0 ? (
            <>
              {" "}
              · tables:{" "}
              <span className="font-mono text-[11px] text-charcoal/75">
                {formatTables(history.allTables)}
              </span>
            </>
          ) : null}
        </p>
      </div>

      {lockHeld ? (
        <div
          className={`px-5 sm:px-6 py-4 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 ${
            lock.stuck ? "bg-coral/[0.06]" : "bg-gold/[0.08]"
          }`}
        >
          <div className="min-w-0">
            <p
              className={`font-mono text-[11px] tracking-[0.2em] uppercase ${
                lock.stuck ? "text-coral" : "text-gold"
              }`}
            >
              {lock.stuck ? "Stuck refresh lock" : "Refresh lock held"}
            </p>
            <p className="mt-2 text-sm text-slate leading-relaxed max-w-2xl">
              {lock.stuck
                ? lock.stuckReason
                : "A listings refresh lock is active. Sync actions may be blocked until it clears."}
            </p>
            <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 font-mono text-[11px] text-charcoal/70">
              <dt className="text-charcoal/45">In progress</dt>
              <dd>{lock.inProgress ? "Yes" : "No"}</dd>
              <dt className="text-charcoal/45">Depth</dt>
              <dd className="tabular-nums">{lock.depth}</dd>
              <dt className="text-charcoal/45">Started</dt>
              <dd className="tabular-nums">{formatTimestamp(lock.startedAt)}</dd>
              <dt className="text-charcoal/45">Last finished</dt>
              <dd className="tabular-nums">{formatTimestamp(lock.finishedAt)}</dd>
            </dl>
            {message ? (
              <p className="mt-2 font-mono text-[10px] tracking-wide text-sage">{message}</p>
            ) : null}
          </div>
          {showClear ? (
            <button
              type="button"
              onClick={() => void clearLock()}
              disabled={clearing}
              className={`font-mono text-[10px] tracking-[0.12em] uppercase rounded-full px-4 py-2 border shrink-0 self-start transition-colors disabled:opacity-40 disabled:pointer-events-none ${
                lock.stuck
                  ? "border-coral/45 text-coral bg-white hover:bg-coral/10"
                  : "border-gold/45 text-navy bg-white hover:bg-gold/15"
              }`}
            >
              {clearing ? "Clearing…" : "Clear lock"}
            </button>
          ) : null}
        </div>
      ) : null}

      <RefreshLogCompact entries={history.entries} windowHours={windowHours} />

      {lockHeld && !lock.stuck && lock.inProgress ? (
        <div className="px-5 sm:px-6 py-2 border-t border-gold/20 bg-white/50">
          <p className="font-mono text-[10px] tracking-wide text-charcoal/55">
            If no sync is actually running (e.g. after a dev hot reload), use Clear lock to
            unblock scheduled syncs.
          </p>
        </div>
      ) : null}
    </div>
  );
}
