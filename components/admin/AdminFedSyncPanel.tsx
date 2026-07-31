"use client";

import { useEffect, useState } from "react";

type MeetingRow = {
  id: string;
  endDate: string;
  decision: string | null;
  statementUrl: string | null;
  hasSummary: boolean;
  summaryChars: number;
  syncedAt: string | null;
};

type StatusPayload = {
  lastSyncedAt: string | null;
  lastResult: string | null;
  meetingCount: number;
  withSummary: number;
  meetings: MeetingRow[];
};

export default function AdminFedSyncPanel() {
  const [status, setStatus] = useState<StatusPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function refresh() {
    const res = await fetch("/api/admin/fed-sync", { cache: "no-store" });
    if (!res.ok) throw new Error("Failed to load Fed sync status");
    setStatus((await res.json()) as StatusPayload);
  }

  useEffect(() => {
    let cancelled = false;
    refresh()
      .catch((err) => {
        if (!cancelled) {
          setMessage(err instanceof Error ? err.message : "Load failed");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function runSync() {
    setRunning(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/fed-sync", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      });
      const body = (await res.json()) as {
        ok?: boolean;
        error?: string;
        updated?: number;
        fetched?: number;
        skipped?: number;
        failed?: number;
      };
      if (!res.ok && res.status !== 207) {
        setMessage(body.error ?? "Fed sync failed");
        return;
      }
      setMessage(
        `Synced — fetched ${body.fetched ?? 0}, updated ${body.updated ?? 0}, skipped ${body.skipped ?? 0}, failed ${body.failed ?? 0}`,
      );
      await refresh();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Fed sync failed");
    } finally {
      setRunning(false);
    }
  }

  if (loading) {
    return (
      <div className="rounded-2xl border border-charcoal/[0.08] bg-white px-6 py-8 text-sm text-slate">
        Loading Fed sync…
      </div>
    );
  }

  return (
    <div
      id="admin-fed-sync"
      className="overflow-hidden rounded-2xl border border-charcoal/[0.08] bg-white shadow-sm shadow-charcoal/[0.04]"
    >
      <div className="border-b border-charcoal/[0.08] bg-cream/40 px-5 py-4 sm:px-6">
        <p className="font-mono text-[11px] tracking-[0.2em] uppercase text-gold">
          Fed sync
        </p>
        <p className="mt-1 max-w-3xl text-sm text-slate">
          Fetches official FOMC statements from federalreserve.gov, greps the
          target range / vote / body paragraphs, and stores them in Postgres for{" "}
          <span className="font-mono text-xs">/fed-analysis</span>. No AI key —
          the summary is the Fed&apos;s own text.
        </p>
      </div>

      <div className="space-y-4 px-5 py-5 sm:px-6">
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => void runSync()}
            disabled={running}
            className="rounded-full border border-navy/30 bg-cream/40 px-4 py-2 font-mono text-[10px] tracking-[0.12em] uppercase text-navy transition-colors hover:bg-cream disabled:opacity-40"
          >
            {running ? "Syncing…" : "Run Fed sync"}
          </button>
          {status?.lastSyncedAt ? (
            <p className="font-mono text-[10px] text-charcoal/45">
              Last run {new Date(status.lastSyncedAt).toLocaleString()}
              {status.lastResult ? ` · ${status.lastResult}` : ""}
            </p>
          ) : (
            <p className="font-mono text-[10px] text-charcoal/45">
              Never run on this database
            </p>
          )}
        </div>

        {message ? (
          <p className="font-mono text-[10px] text-sage">{message}</p>
        ) : null}

        <p className="font-mono text-[10px] tracking-[0.12em] uppercase text-charcoal/45">
          {status?.withSummary ?? 0} of {status?.meetingCount ?? 0} meetings
          have a stored summary
        </p>

        <ul className="divide-y divide-charcoal/[0.08] rounded-xl border border-charcoal/[0.08]">
          {(status?.meetings ?? [])
            .slice()
            .reverse()
            .slice(0, 12)
            .map((m) => (
              <li
                key={m.id}
                className="flex flex-wrap items-baseline justify-between gap-2 px-4 py-2.5"
              >
                <div className="min-w-0">
                  <p className="font-mono text-[11px] text-navy">
                    {m.id}{" "}
                    <span className="text-charcoal/40">· {m.endDate}</span>
                  </p>
                  <p className="mt-0.5 font-mono text-[10px] text-charcoal/45">
                    {m.decision ?? "pending"}
                    {m.hasSummary
                      ? ` · summary ${m.summaryChars.toLocaleString()} chars`
                      : " · no summary yet"}
                  </p>
                </div>
                {m.statementUrl ? (
                  <a
                    href={m.statementUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="font-mono text-[10px] uppercase tracking-[0.12em] text-navy underline underline-offset-2"
                  >
                    Statement
                  </a>
                ) : null}
              </li>
            ))}
        </ul>
      </div>
    </div>
  );
}
