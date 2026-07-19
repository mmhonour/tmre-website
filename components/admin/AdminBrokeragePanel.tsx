"use client";

import { useEffect, useState } from "react";
import { DEFAULT_BROKERAGE_NAME } from "@/lib/business-info";

type BrokerageConfig = {
  name: string;
  default: string;
};

/**
 * Admin control for the public brokerage display name (footer, contact, legal
 * pages, about, nav attributions, JSON-LD). Stored in sync_meta — no redeploy.
 */
export default function AdminBrokeragePanel({
  initial,
}: {
  initial?: BrokerageConfig;
}) {
  const [config, setConfig] = useState<BrokerageConfig | null>(initial ?? null);
  const [value, setValue] = useState<string>(initial?.name ?? "");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (initial) return;
    let cancelled = false;
    fetch("/api/admin/brokerage-name", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((body: BrokerageConfig | null) => {
        if (cancelled || !body) return;
        setConfig(body);
        setValue(body.name);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [initial]);

  const trimmed = value.trim();
  const valid = trimmed.length >= 2 && trimmed.length <= 120;

  const save = async () => {
    if (!valid) {
      setMessage("Enter a brokerage name (2–120 characters)");
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/brokerage-name", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      });
      const body = (await res.json()) as BrokerageConfig & {
        ok?: boolean;
        error?: string;
      };
      if (!res.ok) {
        setMessage(body.error ?? "Save failed");
        return;
      }
      setConfig(body);
      setValue(body.name);
      setMessage(`Saved — site now shows “${body.name}”`);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const dirty = config != null && config.name.trim() !== trimmed;

  return (
    <div
      id="admin-brokerage-name"
      className="h-full scroll-mt-24 rounded-2xl border border-charcoal/[0.08] bg-white shadow-sm overflow-hidden"
    >
      <div className="px-5 sm:px-6 py-4 border-b border-charcoal/[0.08] bg-cream/40">
        <p className="font-mono text-[11px] tracking-[0.2em] uppercase text-gold">
          Brokerage name
        </p>
        <p className="mt-1 text-sm text-slate max-w-2xl">
          Display name for the sponsoring brokerage everywhere it appears
          (footer disclosure, contact page, privacy/terms, about, nav
          attributions, and business schema). Change here — no code push or
          redeploy needed.
        </p>
      </div>
      <div className="px-5 sm:px-6 py-4">
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex min-w-[16rem] flex-1 flex-col gap-1">
            <span className="font-mono text-[10px] tracking-[0.16em] uppercase text-charcoal/50">
              Brokerage
            </span>
            <input
              type="text"
              value={value}
              placeholder={config?.default ?? DEFAULT_BROKERAGE_NAME}
              onChange={(e) => setValue(e.target.value)}
              maxLength={120}
              className="w-full rounded-lg border border-charcoal/15 px-3 py-2 text-sm text-navy focus:border-navy focus:outline-none"
            />
          </label>
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving || !dirty || !valid}
            className="font-mono text-[10px] tracking-[0.12em] uppercase rounded-full px-4 py-2 border border-navy/30 text-navy bg-cream/40 hover:bg-cream disabled:opacity-40 disabled:pointer-events-none transition-colors"
          >
            {saving ? "Saving…" : "Save"}
          </button>
          {config ? (
            <p className="font-mono text-[10px] text-charcoal/45 pb-2">
              current {config.name} · default {config.default}
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
