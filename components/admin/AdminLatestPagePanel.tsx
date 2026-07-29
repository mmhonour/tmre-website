"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  LATEST_FEED_RANKING,
  LATEST_STATUS_INPUTS,
  LATEST_STATUS_PRECEDENCE,
} from "@/lib/latest-status-rules";

type StepEntry = { at: string; step: string; detail?: string };

type UpsertHist = {
  finishedAt: string;
  upserted: number;
  inserted: number;
  updated: number;
  ok: boolean;
};

type Transparency = {
  lastPull: string | null;
  newestMlsInDb: string | null;
  feedNewestMls: string | null;
  feedGeneratedAt: string | null;
  feedRowCount: number;
  upsertLabel: string | null;
  lastUpserts: UpsertHist | null;
  upsertHistory: UpsertHist[];
  stepSummary: string | null;
  stepSource: string | null;
  stepFinishedAt: string | null;
  recentSteps: StepEntry[];
  error: string | null;
};

function ageLabel(iso: string | null, nowMs: number): string {
  if (!iso) return "—";
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return iso;
  const mins = Math.max(0, Math.round((nowMs - ms) / 60_000));
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

/**
 * Daily health card: Latest is how we verify fresh listings. Shows what
 * Incremental last did and whether /latest is serving that data.
 */
export default function AdminLatestPagePanel() {
  const [data, setData] = useState<Transparency | null>(null);
  const [loading, setLoading] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/sync", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = (await res.json()) as {
        stats?: { lastIncrementalSync?: string | null };
        latestListingUpdate?: string | null;
        latestFeedNewestMls?: string | null;
        latestFeedGeneratedAt?: string | null;
        latestFeedRowCount?: number | null;
        lastIncrementalUpsertsLabel?: string | null;
        lastIncrementalUpserts?: UpsertHist | null;
        incrementalUpsertHistory?: UpsertHist[];
        incrementalStepLog?: {
          source?: string;
          finishedAt?: string | null;
          summary?: string;
          steps?: StepEntry[];
        } | null;
      };
      const steps = body.incrementalStepLog?.steps ?? [];
      setData({
        lastPull: body.stats?.lastIncrementalSync ?? null,
        newestMlsInDb: body.latestListingUpdate ?? null,
        feedNewestMls: body.latestFeedNewestMls ?? null,
        feedGeneratedAt: body.latestFeedGeneratedAt ?? null,
        feedRowCount: body.latestFeedRowCount ?? 0,
        upsertLabel: body.lastIncrementalUpsertsLabel ?? null,
        lastUpserts: body.lastIncrementalUpserts ?? null,
        upsertHistory: body.incrementalUpsertHistory ?? [],
        stepSummary: body.incrementalStepLog?.summary ?? null,
        stepSource: body.incrementalStepLog?.source ?? null,
        stepFinishedAt: body.incrementalStepLog?.finishedAt ?? null,
        recentSteps: steps.slice(-8),
        error: null,
      });
      setNowMs(Date.now());
    } catch (err) {
      setData({
        lastPull: null,
        newestMlsInDb: null,
        feedNewestMls: null,
        feedGeneratedAt: null,
        feedRowCount: 0,
        upsertLabel: null,
        lastUpserts: null,
        upsertHistory: [],
        stepSummary: null,
        stepSource: null,
        stepFinishedAt: null,
        recentSteps: [],
        error: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const id = window.setInterval(() => void load(), 30_000);
    return () => window.clearInterval(id);
  }, [load]);

  const feedAgeMs =
    data?.feedNewestMls != null
      ? Date.now() - Date.parse(data.feedNewestMls)
      : null;
  const feedStale =
    feedAgeMs != null &&
    Number.isFinite(feedAgeMs) &&
    feedAgeMs > 36 * 60 * 60 * 1000;

  return (
    <div
      id="admin-latest-page"
      className="scroll-mt-24 rounded-2xl border border-charcoal/[0.08] bg-white shadow-sm overflow-hidden"
    >
      <div className="px-5 sm:px-6 py-4 border-b border-charcoal/[0.08] bg-cream/40 flex flex-wrap items-baseline justify-between gap-3">
        <div className="min-w-0">
          <p className="font-mono text-[11px] tracking-[0.2em] uppercase text-gold">
            Latest page — daily health check
          </p>
          <p className="mt-1 text-sm text-slate max-w-2xl">
            Deferred until Incremental consistently finishes on a ~30 minute
            cadence — clocks here are not trustworthy while pull End / Last
            pull are wrong. After that, use this card (and{" "}
            <Link
              href="/latest"
              className="text-navy underline decoration-navy/25 underline-offset-2 hover:decoration-navy"
              target="_blank"
              rel="noreferrer"
            >
              /latest
            </Link>
            ) to confirm the site is serving fresh listings.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="shrink-0 rounded-lg border border-charcoal/15 bg-cream/40 px-3 py-1.5 font-mono text-[10px] tracking-[0.14em] uppercase text-navy hover:bg-cream disabled:opacity-50"
        >
          {loading ? "Loading…" : "Refresh"}
        </button>
      </div>

      <div className="px-5 sm:px-6 py-4 space-y-4 text-sm text-slate">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <ClockCard
            label="Incremental finished"
            age={ageLabel(data?.lastPull ?? null, nowMs)}
            detail={data?.lastPull ?? "—"}
          />
          <ClockCard
            label="Newest MLS mod in DB"
            age={ageLabel(data?.newestMlsInDb ?? null, nowMs)}
            detail={data?.newestMlsInDb ?? "—"}
          />
          <ClockCard
            label="Newest MLS on /latest feed"
            age={ageLabel(data?.feedNewestMls ?? null, nowMs)}
            detail={data?.feedNewestMls ?? "—"}
            warn={feedStale}
            warnText="stale (>36h)"
          />
          <ClockCard
            label="Feed cache rebuilt"
            age={ageLabel(data?.feedGeneratedAt ?? null, nowMs)}
            detail={
              data?.feedGeneratedAt
                ? `${data.feedRowCount} rows · ${data.feedGeneratedAt}`
                : "—"
            }
          />
        </div>

        {data?.error ? (
          <p className="font-mono text-xs text-coral">{data.error}</p>
        ) : null}

        <div className="rounded-xl border border-charcoal/[0.08] bg-cream/30 px-4 py-3 space-y-2">
          <p className="font-mono text-[10px] tracking-[0.14em] uppercase text-charcoal/45">
            Incremental upserts (new inserts + updates)
          </p>
          {data?.upsertLabel ? (
            <>
              <p className="text-sm text-navy">
                Last pull:{" "}
                <span className="font-mono font-medium">{data.upsertLabel}</span>
                {data.lastUpserts?.finishedAt
                  ? ` · ${ageLabel(data.lastUpserts.finishedAt, nowMs)}`
                  : null}
              </p>
              {data.upsertHistory.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[420px] text-left font-mono text-[11px]">
                    <thead>
                      <tr className="text-charcoal/45 uppercase tracking-[0.08em]">
                        <th className="py-1 pr-3 font-medium">When</th>
                        <th className="py-1 pr-3 font-medium text-right">Upserts</th>
                        <th className="py-1 pr-3 font-medium text-right">New</th>
                        <th className="py-1 pr-3 font-medium text-right">Updated</th>
                        <th className="py-1 font-medium">OK</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.upsertHistory.slice(0, 16).map((row) => (
                        <tr
                          key={row.finishedAt}
                          className="border-t border-charcoal/[0.06] text-navy"
                        >
                          <td className="py-1 pr-3 whitespace-nowrap">
                            {ageLabel(row.finishedAt, nowMs)}
                          </td>
                          <td className="py-1 pr-3 text-right tabular-nums">
                            {row.upserted}
                          </td>
                          <td className="py-1 pr-3 text-right tabular-nums">
                            {row.inserted}
                          </td>
                          <td className="py-1 pr-3 text-right tabular-nums">
                            {row.updated}
                          </td>
                          <td
                            className={`py-1 ${row.ok ? "text-sage" : "text-coral"}`}
                          >
                            {row.ok ? "OK" : "Fail"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
              <p className="font-mono text-[10px] text-charcoal/45">
                Keeps the last 48 Incremental finishes (~24h at */30). Town
                breakdown also lands in Sync history as “N new, M updated”.
              </p>
            </>
          ) : (
            <p className="text-sm text-slate">
              No upsert stats yet — after the next Incremental, this shows how
              many listings were newly inserted vs updated each pull.
            </p>
          )}
        </div>

        <div className="rounded-xl border border-charcoal/[0.08] bg-cream/30 px-4 py-3 space-y-2">
          <p className="font-mono text-[10px] tracking-[0.14em] uppercase text-charcoal/45">
            Last Incremental step log
          </p>
          {data?.stepSummary || data?.recentSteps.length ? (
            <>
              <p className="font-mono text-xs text-navy">
                {data.stepSource ? `source=${data.stepSource}` : ""}
                {data.stepFinishedAt
                  ? ` · finished ${ageLabel(data.stepFinishedAt, nowMs)}`
                  : " · in progress / unfinished"}
              </p>
              {data.stepSummary ? (
                <p className="text-sm text-navy">{data.stepSummary}</p>
              ) : null}
              {data.recentSteps.length > 0 ? (
                <ul className="font-mono text-[11px] text-charcoal/70 space-y-1 max-h-40 overflow-y-auto">
                  {data.recentSteps.map((s, i) => (
                    <li key={`${s.at}-${s.step}-${i}`}>
                      <span className="text-charcoal/40">
                        {s.at.slice(11, 19)}
                      </span>{" "}
                      <span className="text-navy">{s.step}</span>
                      {s.detail ? (
                        <span className="text-charcoal/55"> — {s.detail}</span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              ) : null}
            </>
          ) : (
            <p className="text-sm text-slate">
              No step log yet. After deploy, run Incremental — then steps appear
              here (and via{" "}
              <code className="font-mono text-[12px]">
                npm run dump:incremental-step-log
              </code>
              ).
            </p>
          )}
        </div>

        <div className="space-y-2 leading-relaxed">
          <p className="font-medium text-navy">How Latest works</p>
          <ol className="list-decimal pl-5 space-y-1.5">
            <li>
              Incremental pulls MLS changes for all 7 towns (at least the last 36
              hours) into Postgres.
            </li>
            <li>
              A follow-up step rebuilds the /latest feed cache from those
              listings — badges and ranking below are applied then.
            </li>
            <li>
              Opening /latest does not call RETS — it shows that feed. If “Newest
              MLS on /latest feed” is old while “Newest MLS mod in DB” is fresh,
              the feed rebuild failed — not “the site has no listings.”
            </li>
          </ol>
        </div>

        <LatestStatusLogicSurface />
      </div>
    </div>
  );
}

/**
 * Logic surface for /latest badges + feed ranking. Data comes from
 * `lib/latest-status-rules.ts` — the same module the feed builder imports —
 * so this card cannot drift from production behavior.
 */
function LatestStatusLogicSurface() {
  return (
    <div className="rounded-xl border border-charcoal/[0.08] bg-cream/20 overflow-hidden">
      <div className="px-4 py-3 border-b border-charcoal/[0.08] bg-cream/40">
        <p className="font-mono text-[10px] tracking-[0.14em] uppercase text-charcoal/45">
          Status logic surface
        </p>
        <p className="mt-1 text-sm text-navy font-medium">
          How /latest badges are assigned and which rows win the 30 slots
        </p>
        <p className="mt-1 font-mono text-[10px] text-charcoal/40">
          Source: <span className="text-navy">lib/latest-status-rules.ts</span>{" "}
          · applied by{" "}
          <span className="text-navy">lib/latest-listings.ts</span> +{" "}
          <span className="text-navy">lib/latest-town-coverage.ts</span>
        </p>
      </div>

      <div className="px-4 py-4 space-y-5">
        <div className="space-y-2">
          <p className="font-mono text-[10px] tracking-[0.14em] uppercase text-charcoal/45">
            Badge precedence — first match wins
          </p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead>
                <tr className="font-mono text-[10px] uppercase tracking-[0.08em] text-charcoal/45">
                  <th className="py-1.5 pr-3 font-medium">#</th>
                  <th className="py-1.5 pr-3 font-medium">Badge</th>
                  <th className="py-1.5 pr-3 font-medium">Event?</th>
                  <th className="py-1.5 font-medium">Rule</th>
                </tr>
              </thead>
              <tbody>
                {LATEST_STATUS_PRECEDENCE.map((row) => (
                  <tr
                    key={row.status}
                    className="border-t border-charcoal/[0.06] align-top"
                  >
                    <td className="py-2 pr-3 font-mono text-xs text-charcoal/40">
                      {row.order}
                    </td>
                    <td className="py-2 pr-3 whitespace-nowrap">
                      <span className="font-mono text-[11px] tracking-[0.08em] uppercase text-navy">
                        {row.badge}
                      </span>
                    </td>
                    <td className="py-2 pr-3 font-mono text-[11px]">
                      {row.event ? (
                        <span className="text-sage">Yes — priority slot</span>
                      ) : (
                        <span className="text-charcoal/40">No</span>
                      )}
                    </td>
                    <td className="py-2 text-slate leading-snug">{row.rule}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="space-y-2">
          <p className="font-mono text-[10px] tracking-[0.14em] uppercase text-charcoal/45">
            Feed ranking — after badges are assigned
          </p>
          <ol className="space-y-2">
            {LATEST_FEED_RANKING.map((step) => (
              <li key={step.order} className="flex gap-3 text-sm">
                <span className="font-mono text-[11px] text-charcoal/40 shrink-0 pt-0.5">
                  {step.order}.
                </span>
                <span>
                  <span className="text-navy font-medium">{step.label}</span>
                  <span className="text-slate"> — {step.detail}</span>
                </span>
              </li>
            ))}
          </ol>
        </div>

        <div className="space-y-2">
          <p className="font-mono text-[10px] tracking-[0.14em] uppercase text-charcoal/45">
            Inputs the badge engine reads
          </p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-left text-sm">
              <thead>
                <tr className="font-mono text-[10px] uppercase tracking-[0.08em] text-charcoal/45">
                  <th className="py-1.5 pr-3 font-medium">Field</th>
                  <th className="py-1.5 pr-3 font-medium">Source</th>
                  <th className="py-1.5 font-medium">Used for</th>
                </tr>
              </thead>
              <tbody>
                {LATEST_STATUS_INPUTS.map((row) => (
                  <tr
                    key={row.field}
                    className="border-t border-charcoal/[0.06] align-top"
                  >
                    <td className="py-2 pr-3 font-mono text-[11px] text-navy whitespace-nowrap">
                      {row.field}
                    </td>
                    <td className="py-2 pr-3 text-slate text-xs leading-snug">
                      {row.source}
                    </td>
                    <td className="py-2 text-slate text-xs leading-snug">
                      {row.usedFor}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

function ClockCard({
  label,
  age,
  detail,
  warn,
  warnText,
}: {
  label: string;
  age: string;
  detail: string;
  warn?: boolean;
  warnText?: string;
}) {
  return (
    <div
      className={`rounded-lg border px-3 py-3 ${
        warn ? "border-coral/40 bg-coral/5" : "border-charcoal/[0.08] bg-cream/30"
      }`}
    >
      <p className="font-mono text-[10px] tracking-[0.14em] uppercase text-charcoal/45">
        {label}
      </p>
      <p className="mt-1 font-mono text-sm text-navy tabular-nums">
        {age}
        {warn && warnText ? (
          <span className="ml-2 text-coral font-sans text-xs normal-case tracking-normal">
            {warnText}
          </span>
        ) : null}
      </p>
      <p className="mt-1 font-mono text-[10px] text-charcoal/40 break-all">
        {detail}
      </p>
    </div>
  );
}
