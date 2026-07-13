"use client";

import { useEffect, useState } from "react";

type DbTuning = {
  chunkRows: number;
  default: number;
  min: number;
  max: number;
};

/**
 * Admin control for database write tuning — currently the rows-per-INSERT used
 * by chunked upserts (inventory + tax history + edge scores). Higher = fewer
 * round-trips to Neon (faster sync), auto-capped server-side to Postgres's
 * bind-param limit. Stored in sync_meta, no redeploy needed.
 */
export default function AdminDbTuningPanel({
  initial,
}: {
  initial?: DbTuning;
}) {
  const [tuning, setTuning] = useState<DbTuning | null>(initial ?? null);
  const [value, setValue] = useState<string>(
    initial ? String(initial.chunkRows) : "",
  );
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (initial) return;
    let cancelled = false;
    fetch("/api/admin/db-tuning", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((body: DbTuning | null) => {
        if (cancelled || !body) return;
        setTuning(body);
        setValue(String(body.chunkRows));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [initial]);

  const save = async () => {
    const n = Number(value);
    if (!Number.isFinite(n)) {
      setMessage("Enter a number");
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/db-tuning", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ chunkRows: n }),
      });
      const body = (await res.json()) as DbTuning & { ok?: boolean; error?: string };
      if (!res.ok) {
        setMessage(body.error ?? "Save failed");
        return;
      }
      setTuning(body);
      setValue(String(body.chunkRows));
      setMessage(
        n !== body.chunkRows
          ? `Clamped to ${body.chunkRows} (allowed ${body.min}–${body.max})`
          : `Saved — ${body.chunkRows} rows per INSERT`,
      );
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const dirty = tuning != null && String(tuning.chunkRows) !== value.trim();

  return (
    <div
      id="admin-db-tuning"
      className="scroll-mt-24 rounded-2xl border border-charcoal/[0.08] bg-white shadow-sm overflow-hidden"
    >
      <div className="px-5 sm:px-6 py-4 border-b border-charcoal/[0.08] bg-cream/40">
        <p className="font-mono text-[11px] tracking-[0.2em] uppercase text-gold">
          Database write tuning
        </p>
        <p className="mt-1 text-sm text-slate max-w-2xl">
          Rows per multi-row <span className="font-mono text-navy/80">INSERT</span> for chunked
          upserts (listings, tax history, edge scores). Higher means fewer network round-trips to
          Neon and a faster sync; the server auto-caps this to Postgres&apos;s bind-param limit per
          table, so an over-large value is safe.
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
              value={value}
              min={tuning?.min}
              max={tuning?.max}
              onChange={(e) => setValue(e.target.value)}
              className="w-32 rounded-lg border border-charcoal/15 px-3 py-2 font-mono text-sm text-navy focus:border-navy focus:outline-none"
            />
          </label>
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving || !dirty}
            className="font-mono text-[10px] tracking-[0.12em] uppercase rounded-full px-4 py-2 border border-navy/30 text-navy bg-cream/40 hover:bg-cream disabled:opacity-40 disabled:pointer-events-none transition-colors"
          >
            {saving ? "Saving…" : "Save"}
          </button>
          {tuning ? (
            <p className="font-mono text-[10px] text-charcoal/45 pb-2">
              current {tuning.chunkRows} · default {tuning.default} · range {tuning.min}–{tuning.max}
            </p>
          ) : null}
        </div>
        {message ? (
          <p className="mt-2 font-mono text-[10px] text-sage">{message}</p>
        ) : null}
      </div>
    </div>
  );
}
