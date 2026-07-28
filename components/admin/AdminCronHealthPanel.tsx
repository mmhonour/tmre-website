"use client";

import { useCallback, useEffect, useState } from "react";

type WatchdogResult = {
  action: string;
  lastIncrementalSync: string | null;
  ageMs: number | null;
  detail?: string;
};

type CronStatus = {
  lastIncrementalCronTick: string | null;
  lastIncrementalSync?: string | null;
  syncStale?: boolean;
  syncAgeMs?: number | null;
  paused?: boolean;
  hasSyncCronSecret: boolean;
  siteBaseUrl: string | null;
  watchdog?: WatchdogResult | null;
};

function formatAge(iso: string | null | undefined, nowMs: number): string {
  if (!iso) return "never";
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return iso;
  const delta = Math.max(0, nowMs - ms);
  if (delta < 60_000) return "just now";
  if (delta < 60 * 60_000) return `${Math.round(delta / 60_000)}m ago`;
  if (delta < 48 * 60 * 60_000) return `${Math.floor(delta / (60 * 60_000))}h ago`;
  return `${Math.floor(delta / (24 * 60 * 60_000))}d ago`;
}

function formatIso(iso: string | null | undefined): string {
  if (!iso) return "never";
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return iso;
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(ms));
}

/**
 * Proves whether Netlify's scheduled sync-listings trigger has fired, and
 * whether a successful incremental RETS write followed. Opening this panel
 * also runs the stale-sync watchdog once.
 */
export default function AdminCronHealthPanel({
  initialTick,
}: {
  initialTick?: string | null;
}) {
  const [status, setStatus] = useState<CronStatus | null>(
    initialTick !== undefined
      ? {
          lastIncrementalCronTick: initialTick,
          hasSyncCronSecret: false,
          siteBaseUrl: null,
        }
      : null,
  );
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/cron/sync-listings", {
        cache: "no-store",
      });
      if (!res.ok) return;
      const body = (await res.json()) as CronStatus;
      setStatus(body);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    void refresh();
    const id = window.setInterval(() => {
      setNowMs(Date.now());
      void refresh();
    }, 30_000);
    return () => window.clearInterval(id);
  }, [refresh]);

  const runNow = async () => {
    setRunning(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/cron/sync-listings", {
        method: "POST",
      });
      const body = (await res.json()) as {
        ok?: boolean;
        mode?: string;
        error?: string;
        note?: string;
        workerStatus?: number;
      };
      if (!res.ok || body.ok === false) {
        setMessage(body.error ?? body.note ?? `Failed (${res.status})`);
      } else {
        setMessage(
          body.note ??
            (body.mode === "background-queued" || body.mode === "scheduled-queue"
              ? "Queued background worker — watch Syncs → Dashboard Start/End"
              : `Incremental finished (${body.mode ?? "ok"})`),
        );
      }
      await refresh();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Run failed");
    } finally {
      setRunning(false);
    }
  };

  const tick = status?.lastIncrementalCronTick ?? initialTick ?? null;
  const lastSync = status?.lastIncrementalSync ?? null;
  const tickAge = formatAge(tick, nowMs);
  const syncAge = formatAge(lastSync, nowMs);
  const tickStale =
    !tick ||
    (() => {
      const ms = Date.parse(tick);
      return Number.isNaN(ms) || nowMs - ms > 45 * 60 * 1000;
    })();
  const syncStale = status?.syncStale ?? tickStale;
  const paused = status?.paused === true;
  const alert = paused || tickStale || syncStale;

  return (
    <div
      className={`rounded-lg border px-4 py-3 ${
        alert ? "border-rose-300 bg-rose-50/80" : "border-sage/40 bg-sage/10"
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1.5">
          <p className="font-mono text-[10px] tracking-[0.14em] uppercase text-charcoal/50">
            Incremental cron · closed loop
          </p>
          <p className="text-sm text-navy">
            Scheduler tick:{" "}
            <span className="font-semibold tabular-nums">
              {formatIso(tick)} ({tickAge})
            </span>
          </p>
          <p className="text-sm text-navy">
            Last successful sync:{" "}
            <span className="font-semibold tabular-nums">
              {formatIso(lastSync)} ({syncAge})
            </span>
            {syncStale ? (
              <span className="ml-2 font-mono text-[10px] uppercase text-rose-700">
                stale
              </span>
            ) : null}
          </p>
          {paused ? (
            <p className="text-xs font-medium text-rose-700">
              Incremental is PAUSED in Syncs → Configure — cron will not pull MLS
              until you uncheck Pause on the Incremental row.
            </p>
          ) : null}
          <p className="text-xs text-charcoal/60 leading-relaxed max-w-xl">
            Every 30m{" "}
            <span className="font-mono text-[10px]">sync-listings</span> stamps
            the heartbeat and queues{" "}
            <span className="font-mono text-[10px]">sync-listings-worker</span>{" "}
            (full RETS, up to ~15m). Every 15m{" "}
            <span className="font-mono text-[10px]">sync-listings-watchdog</span>{" "}
            re-queues if the last successful sync is older than ~70m. Opening this
            panel also runs the watchdog once.
          </p>
          {status?.watchdog && status.watchdog.action !== "fresh" ? (
            <p className="text-xs font-mono text-charcoal/70">
              Watchdog: {status.watchdog.action}
              {status.watchdog.detail ? ` — ${status.watchdog.detail}` : ""}
            </p>
          ) : null}
          {status && !status.hasSyncCronSecret ? (
            <p className="text-xs text-gold">
              Tip: set <span className="font-mono">SYNC_CRON_SECRET</span> in
              Netlify env so only the scheduler/Admin can invoke workers. Also set{" "}
              <span className="font-mono">URL</span> /{" "}
              <span className="font-mono">SITE_NAME</span> so thin crons can POST
              to <span className="font-mono">*.netlify.app</span> workers.
            </p>
          ) : null}
          {message ? (
            <p className="text-xs text-charcoal/70 font-mono">{message}</p>
          ) : null}
        </div>
        <button
          type="button"
          onClick={() => void runNow()}
          disabled={running}
          className="shrink-0 font-mono text-[10px] tracking-[0.12em] uppercase rounded-full px-3 py-1.5 border border-navy/20 text-navy bg-white hover:bg-cream/80 disabled:opacity-40"
        >
          {running ? "Queuing…" : "Run cron now"}
        </button>
      </div>
    </div>
  );
}
