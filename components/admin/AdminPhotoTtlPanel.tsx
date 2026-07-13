"use client";

import { useEffect, useState } from "react";

type PhotoTtl = {
  ttlMinutes: number;
  default: number;
  min: number;
  max: number;
};

/** Render minutes as a friendly duration (e.g. "30 min", "7 days"). */
function humanizeMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hours = minutes / 60;
  if (hours < 24) {
    return Number.isInteger(hours) ? `${hours} hr` : `${hours.toFixed(1)} hr`;
  }
  const days = hours / 24;
  return Number.isInteger(days) ? `${days} days` : `${days.toFixed(1)} days`;
}

/**
 * Admin control for the listing-photo warm TTL — how long the sync/warm path
 * treats a stored photo as fresh before re-pulling it from RETS. This is an app
 * freshness policy only: it never deletes anything from R2 and never affects
 * reads (public photo requests always serve whatever is in the store). Longer =
 * less RETS egress. Stored in sync_meta, no redeploy needed.
 */
export default function AdminPhotoTtlPanel({
  initial,
}: {
  initial?: PhotoTtl;
}) {
  const [ttl, setTtl] = useState<PhotoTtl | null>(initial ?? null);
  const [value, setValue] = useState<string>(
    initial ? String(initial.ttlMinutes) : "",
  );
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (initial) return;
    let cancelled = false;
    fetch("/api/admin/photo-ttl", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((body: PhotoTtl | null) => {
        if (cancelled || !body) return;
        setTtl(body);
        setValue(String(body.ttlMinutes));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [initial]);

  const save = async () => {
    const n = Number(value);
    if (!Number.isFinite(n)) {
      setMessage("Enter a number of minutes");
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/photo-ttl", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ttlMinutes: n }),
      });
      const body = (await res.json()) as PhotoTtl & {
        ok?: boolean;
        error?: string;
      };
      if (!res.ok) {
        setMessage(body.error ?? "Save failed");
        return;
      }
      setTtl(body);
      setValue(String(body.ttlMinutes));
      setMessage(
        n !== body.ttlMinutes
          ? `Clamped to ${body.ttlMinutes} min (${humanizeMinutes(body.ttlMinutes)})`
          : `Saved — ${humanizeMinutes(body.ttlMinutes)} freshness window`,
      );
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const dirty = ttl != null && String(ttl.ttlMinutes) !== value.trim();

  return (
    <div
      id="admin-photo-ttl"
      className="scroll-mt-24 rounded-2xl border border-charcoal/[0.08] bg-white shadow-sm overflow-hidden"
    >
      <div className="px-5 sm:px-6 py-4 border-b border-charcoal/[0.08] bg-cream/40">
        <p className="font-mono text-[11px] tracking-[0.2em] uppercase text-gold">
          Listing photo TTL
        </p>
        <p className="mt-1 text-sm text-slate max-w-2xl">
          How long the sync/warm path treats a stored photo as fresh before
          re-pulling it from the MLS. This never deletes anything from R2 and
          never affects what visitors see — reads always serve whatever is in the
          store. MLS photos rarely change, so a longer window (hours to days)
          means the sync stops re-fetching unchanged photos and cuts RETS egress.
        </p>
      </div>
      <div className="px-5 sm:px-6 py-4">
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1">
            <span className="font-mono text-[10px] tracking-[0.16em] uppercase text-charcoal/50">
              Freshness (minutes)
            </span>
            <input
              type="number"
              inputMode="numeric"
              value={value}
              min={ttl?.min}
              max={ttl?.max}
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
          {ttl ? (
            <p className="font-mono text-[10px] text-charcoal/45 pb-2">
              current {ttl.ttlMinutes} min ({humanizeMinutes(ttl.ttlMinutes)}) ·
              default {ttl.default} min · range {ttl.min}–{ttl.max} min
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
