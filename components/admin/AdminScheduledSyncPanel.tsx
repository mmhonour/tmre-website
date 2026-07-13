"use client";

import { useEffect, useState } from "react";

/**
 * Admin kill-switch for automated syncs. When checked, every SCHEDULED entry
 * point (Netlify cron functions, startup overdue catch-up, long-lived Node
 * timers) skips its work. Manual "run step" buttons are unaffected, so a full /
 * incremental resync can still be triggered by hand while automation is paused.
 * Stored in sync_meta (Postgres) — durable across redeploys, no code change.
 */
export default function AdminScheduledSyncPanel({
  initialPaused,
}: {
  initialPaused?: boolean;
}) {
  const [paused, setPaused] = useState<boolean | null>(initialPaused ?? null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (initialPaused != null) return;
    let cancelled = false;
    fetch("/api/admin/scheduled-sync", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((body: { paused?: boolean } | null) => {
        if (cancelled || !body) return;
        setPaused(Boolean(body.paused));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [initialPaused]);

  const toggle = async (next: boolean) => {
    setSaving(true);
    setMessage(null);
    const prev = paused;
    setPaused(next);
    try {
      const res = await fetch("/api/admin/scheduled-sync", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ paused: next }),
      });
      const body = (await res.json()) as { paused?: boolean; error?: string };
      if (!res.ok) {
        setPaused(prev ?? false);
        setMessage(body.error ?? "Save failed");
        return;
      }
      setPaused(Boolean(body.paused));
      setMessage(
        body.paused
          ? "Paused — automated syncs will skip until re-enabled."
          : "Enabled — automated syncs resume on their normal schedule.",
      );
    } catch (err) {
      setPaused(prev ?? false);
      setMessage(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      id="admin-scheduled-sync"
      className="scroll-mt-24 rounded-2xl border border-charcoal/[0.08] bg-white shadow-sm overflow-hidden"
    >
      <div className="px-5 sm:px-6 py-4 border-b border-charcoal/[0.08] bg-cream/40">
        <p className="font-mono text-[11px] tracking-[0.2em] uppercase text-gold">
          Scheduled sync control
        </p>
        <p className="mt-1 text-sm text-slate max-w-2xl">
          Pause all <span className="font-mono text-navy/80">automated</span> syncs — the Netlify
          cron functions (incremental, full, edge scores, property addresses), the startup
          catch-up, and the background timers. Manual <span className="font-mono text-navy/80">run
          step</span> buttons above keep working, so you can still run a resync by hand while
          automation is paused.
        </p>
      </div>
      <div className="px-5 sm:px-6 py-4">
        <label className="flex items-start gap-3 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={Boolean(paused)}
            disabled={saving || paused == null}
            onChange={(e) => void toggle(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-charcoal/30 text-navy focus:ring-navy/40 disabled:opacity-40"
          />
          <span className="flex flex-col gap-0.5">
            <span className="text-sm font-medium text-navy">
              Pause scheduled / cron syncs
            </span>
            <span className="font-mono text-[10px] tracking-[0.04em] text-charcoal/50">
              {paused == null
                ? "loading…"
                : paused
                  ? "PAUSED — automated syncs are skipping"
                  : "ACTIVE — automated syncs run on schedule"}
              {saving ? " · saving…" : ""}
            </span>
          </span>
        </label>
        {message ? (
          <p className="mt-2 font-mono text-[10px] text-sage">{message}</p>
        ) : null}
      </div>
    </div>
  );
}
