"use client";

import { useCallback, useEffect, useState } from "react";

type CronStatus = {
  lastIncrementalCronTick: string | null;
  hasSyncCronSecret: boolean;
  siteBaseUrl: string | null;
};

function formatAge(iso: string | null, nowMs: number): string {
  if (!iso) return "never";
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return iso;
  const delta = Math.max(0, nowMs - ms);
  if (delta < 60_000) return "just now";
  if (delta < 60 * 60_000) return `${Math.round(delta / 60_000)}m ago`;
  if (delta < 48 * 60 * 60_000) return `${Math.floor(delta / (60 * 60_000))}h ago`;
  return `${Math.floor(delta / (24 * 60 * 60_000))}d ago`;
}

/**
 * Proves whether Netlify's scheduled sync-listings trigger has fired.
 * Next time on the Database table is schedule math — this is the real heartbeat.
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
      const res = await fetch("/api/admin/cron/sync-listings", { cache: "no-store" });
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
      const res = await fetch("/api/admin/cron/sync-listings", { method: "POST" });
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
            `Incremental finished (${body.mode ?? "ok"}) — check Start/End on Database tab`,
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
  const age = formatAge(tick, nowMs);
  const stale =
    !tick ||
    (() => {
      const ms = Date.parse(tick);
      return Number.isNaN(ms) || nowMs - ms > 45 * 60 * 1000;
    })();

  return (
    <div
      className={`rounded-lg border px-4 py-3 ${
        stale
          ? "border-rose-300 bg-rose-50/80"
          : "border-sage/40 bg-sage/10"
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <p className="font-mono text-[10px] tracking-[0.14em] uppercase text-charcoal/50">
            Incremental cron heartbeat
          </p>
          <p className="text-sm text-navy">
            Last scheduler tick:{" "}
            <span className="font-semibold tabular-nums">
              {tick
                ? `${new Intl.DateTimeFormat(undefined, {
                    month: "short",
                    day: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                  }).format(new Date(tick))} (${age})`
                : "never"}
            </span>
          </p>
          <p className="text-xs text-charcoal/60 leading-relaxed max-w-xl">
            Database → Incremental Next is only clock-slot math when overdue — not proof
            cron ran. <span className="font-mono text-[10px]">sync-listings</span> always
            runs a lean RETS pull (Active/CS/UC + recent Closed) in-process every 30m and stamps this heartbeat; the
            worker hop is optional side work only. Weekly/monthly jobs use the same pattern:
            thin schedule → <span className="font-mono text-[10px]">*-worker</span>{" "}
            background (never schedule+background on one function — Netlify silent no-op).{" "}
            <span className="font-mono text-[10px]">Run cron now</span> runs the fuller
            path (board/stats + spotlight + saved-search).
          </p>
          {status && !status.hasSyncCronSecret ? (
            <p className="text-xs text-gold">
              Tip: set <span className="font-mono">SYNC_CRON_SECRET</span> in Netlify env
              so only the scheduler/Admin can invoke workers. Also set{" "}
              <span className="font-mono">URL</span> /{" "}
              <span className="font-mono">SITE_NAME</span> so thin crons can POST to{" "}
              <span className="font-mono">*.netlify.app</span> workers.
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
