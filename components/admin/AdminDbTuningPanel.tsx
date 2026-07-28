"use client";

import { useEffect, useState } from "react";

type DbTuning = {
  chunkRows: number;
  default: number;
  min: number;
  max: number;
  activeFetchLimit: number;
  activeFetchDefault: number;
  activeFetchMin: number;
  activeFetchMax: number;
  closedFetchLimit: number;
  expiredFetchLimit: number;
};

/**
 * Admin Syncs → tuning: upsert chunk size + RETS Active fetch limit.
 * Stored in sync_meta (no redeploy). Closed/Expired limits are shown read-only.
 */
export default function AdminDbTuningPanel({
  initial,
}: {
  initial?: DbTuning;
}) {
  const [tuning, setTuning] = useState<DbTuning | null>(initial ?? null);
  const [chunkValue, setChunkValue] = useState<string>(
    initial ? String(initial.chunkRows) : "",
  );
  const [activeFetchValue, setActiveFetchValue] = useState<string>(
    initial ? String(initial.activeFetchLimit) : "",
  );
  const [savingChunk, setSavingChunk] = useState(false);
  const [savingFetch, setSavingFetch] = useState(false);
  const [chunkMessage, setChunkMessage] = useState<string | null>(null);
  const [fetchMessage, setFetchMessage] = useState<string | null>(null);

  useEffect(() => {
    if (initial) return;
    let cancelled = false;
    fetch("/api/admin/db-tuning", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((body: DbTuning | null) => {
        if (cancelled || !body) return;
        setTuning(body);
        setChunkValue(String(body.chunkRows));
        setActiveFetchValue(String(body.activeFetchLimit));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [initial]);

  const applyBody = (body: DbTuning) => {
    setTuning(body);
    setChunkValue(String(body.chunkRows));
    setActiveFetchValue(String(body.activeFetchLimit));
  };

  const saveChunk = async () => {
    const n = Number(chunkValue);
    if (!Number.isFinite(n)) {
      setChunkMessage("Enter a number");
      return;
    }
    setSavingChunk(true);
    setChunkMessage(null);
    try {
      const res = await fetch("/api/admin/db-tuning", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ chunkRows: n }),
      });
      const body = (await res.json()) as DbTuning & {
        ok?: boolean;
        error?: string;
      };
      if (!res.ok) {
        setChunkMessage(body.error ?? "Save failed");
        return;
      }
      applyBody(body);
      setChunkMessage(
        n !== body.chunkRows
          ? `Clamped to ${body.chunkRows} (allowed ${body.min}–${body.max})`
          : `Saved — ${body.chunkRows} rows per INSERT`,
      );
    } catch (err) {
      setChunkMessage(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSavingChunk(false);
    }
  };

  const saveActiveFetch = async () => {
    const n = Number(activeFetchValue);
    if (!Number.isFinite(n)) {
      setFetchMessage("Enter a number");
      return;
    }
    setSavingFetch(true);
    setFetchMessage(null);
    try {
      const res = await fetch("/api/admin/db-tuning", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ activeFetchLimit: n }),
      });
      const body = (await res.json()) as DbTuning & {
        ok?: boolean;
        error?: string;
      };
      if (!res.ok) {
        setFetchMessage(body.error ?? "Save failed");
        return;
      }
      applyBody(body);
      setFetchMessage(
        n !== body.activeFetchLimit
          ? `Clamped to ${body.activeFetchLimit} (allowed ${body.activeFetchMin}–${body.activeFetchMax})`
          : `Saved — ${body.activeFetchLimit} listings per town/status pull`,
      );
    } catch (err) {
      setFetchMessage(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSavingFetch(false);
    }
  };

  const chunkDirty =
    tuning != null && String(tuning.chunkRows) !== chunkValue.trim();
  const fetchDirty =
    tuning != null &&
    String(tuning.activeFetchLimit) !== activeFetchValue.trim();

  return (
    <div className="space-y-6">
      <div
        id="admin-db-tuning"
        className="scroll-mt-24 rounded-2xl border border-charcoal/[0.08] bg-white shadow-sm overflow-hidden"
      >
        <div className="px-5 sm:px-6 py-4 border-b border-charcoal/[0.08] bg-cream/40">
          <p className="font-mono text-[11px] tracking-[0.2em] uppercase text-gold">
            Database write tuning
          </p>
          <p className="mt-1 text-sm text-slate max-w-2xl">
            Rows per multi-row{" "}
            <span className="font-mono text-navy/80">INSERT</span> for chunked
            upserts (listings, tax history, edge scores). Higher means fewer
            network round-trips to Neon; the server auto-caps to Postgres&apos;s
            bind-param limit per table.
          </p>
        </div>
        <div className="px-5 sm:px-6 py-4">
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1">
              <span className="font-mono text-[10px] tracking-[0.16em] uppercase text-charcoal/50">
                Rows per INSERT
              </span>
              <input
                type="number"
                inputMode="numeric"
                value={chunkValue}
                min={tuning?.min}
                max={tuning?.max}
                onChange={(e) => setChunkValue(e.target.value)}
                className="w-32 rounded-lg border border-charcoal/15 px-3 py-2 font-mono text-sm text-navy focus:border-navy focus:outline-none"
              />
            </label>
            <button
              type="button"
              onClick={() => void saveChunk()}
              disabled={savingChunk || !chunkDirty}
              className="font-mono text-[10px] tracking-[0.12em] uppercase rounded-full px-4 py-2 border border-navy/30 text-navy bg-cream/40 hover:bg-cream disabled:opacity-40 disabled:pointer-events-none transition-colors"
            >
              {savingChunk ? "Saving…" : "Save"}
            </button>
            {tuning ? (
              <p className="font-mono text-[10px] text-charcoal/45 pb-2">
                current {tuning.chunkRows} · default {tuning.default} · range{" "}
                {tuning.min}–{tuning.max}
              </p>
            ) : null}
          </div>
          {chunkMessage ? (
            <p className="mt-2 font-mono text-[10px] text-sage">{chunkMessage}</p>
          ) : null}
        </div>
      </div>

      <div
        id="admin-active-fetch-limit"
        className="scroll-mt-24 rounded-2xl border border-charcoal/[0.08] bg-white shadow-sm overflow-hidden"
      >
        <div className="px-5 sm:px-6 py-4 border-b border-charcoal/[0.08] bg-cream/40">
          <p className="font-mono text-[11px] tracking-[0.2em] uppercase text-gold">
            RETS fetch limits
          </p>
          <p className="mt-1 text-sm text-slate max-w-2xl">
            Max listings pulled per town for Active / market status searches
            during sync (
            <span className="font-mono text-navy/80">
              ACTIVE_LISTINGS_FETCH_LIMIT
            </span>
            ). This is separate from upsert chunk size — lowering it caps how
            many rows RETS returns before Postgres writes.
          </p>
        </div>
        <div className="px-5 sm:px-6 py-4 space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1">
              <span className="font-mono text-[10px] tracking-[0.16em] uppercase text-charcoal/50">
                Active fetch limit
              </span>
              <input
                type="number"
                inputMode="numeric"
                value={activeFetchValue}
                min={tuning?.activeFetchMin}
                max={tuning?.activeFetchMax}
                onChange={(e) => setActiveFetchValue(e.target.value)}
                className="w-32 rounded-lg border border-charcoal/15 px-3 py-2 font-mono text-sm text-navy focus:border-navy focus:outline-none"
              />
            </label>
            <button
              type="button"
              onClick={() => void saveActiveFetch()}
              disabled={savingFetch || !fetchDirty}
              className="font-mono text-[10px] tracking-[0.12em] uppercase rounded-full px-4 py-2 border border-navy/30 text-navy bg-cream/40 hover:bg-cream disabled:opacity-40 disabled:pointer-events-none transition-colors"
            >
              {savingFetch ? "Saving…" : "Save"}
            </button>
            {tuning ? (
              <p className="font-mono text-[10px] text-charcoal/45 pb-2">
                current {tuning.activeFetchLimit} · default{" "}
                {tuning.activeFetchDefault} · range {tuning.activeFetchMin}–
                {tuning.activeFetchMax}
              </p>
            ) : null}
          </div>
          {fetchMessage ? (
            <p className="font-mono text-[10px] text-sage">{fetchMessage}</p>
          ) : null}
          {tuning ? (
            <p className="font-mono text-[10px] text-charcoal/45">
              Closed (code): {tuning.closedFetchLimit.toLocaleString()} · Expired
              (code): {tuning.expiredFetchLimit.toLocaleString()} — not
              admin-tunable
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
