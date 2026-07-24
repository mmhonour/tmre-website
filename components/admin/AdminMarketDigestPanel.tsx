"use client";

import { useEffect, useState } from "react";
import type { MarketDigestConfig } from "@/lib/market-digest-shared";

function isValidEmail(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 254) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed);
}

/**
 * Monday morning months-supply / inventory email + Deal of the Week note.
 * Cron: Netlify market-digest (Mon ~8am ET).
 */
export default function AdminMarketDigestPanel({
  initial,
}: {
  initial?: MarketDigestConfig;
}) {
  const [config, setConfig] = useState<MarketDigestConfig | null>(initial ?? null);
  const [email, setEmail] = useState(initial?.email ?? "");
  const [enabled, setEnabled] = useState(initial?.enabled ?? true);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (initial) return;
    let cancelled = false;
    fetch("/api/admin/market-digest", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((body: MarketDigestConfig | null) => {
        if (cancelled || !body) return;
        setConfig(body);
        setEmail(body.email);
        setEnabled(body.enabled);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [initial]);

  const dirty =
    config != null &&
    (config.email !== email.trim() || config.enabled !== enabled);

  const save = async () => {
    const trimmed = email.trim();
    if (!isValidEmail(trimmed)) {
      setMessage("Enter a valid email address");
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/market-digest", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: trimmed, enabled }),
      });
      const body = (await res.json()) as MarketDigestConfig & {
        ok?: boolean;
        error?: string;
      };
      if (!res.ok) {
        setMessage(body.error ?? "Save failed");
        return;
      }
      setConfig(body);
      setEmail(body.email);
      setEnabled(body.enabled);
      setMessage(
        body.enabled
          ? `Saved — Monday brief goes to ${body.email}`
          : "Saved — Monday brief paused",
      );
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const sendTest = async () => {
    setSending(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/market-digest", { method: "POST" });
      const body = (await res.json()) as {
        ok?: boolean;
        error?: string;
        to?: string;
        subject?: string;
        reason?: string;
      } & Partial<MarketDigestConfig>;
      if (!res.ok || !body.ok) {
        setMessage(body.error ?? body.reason ?? "Send failed");
        return;
      }
      if (body.email != null) {
        setConfig((prev) =>
          prev
            ? {
                ...prev,
                ...body,
                email: body.email ?? prev.email,
                enabled: body.enabled ?? prev.enabled,
                lastSentAt: body.lastSentAt ?? prev.lastSentAt,
                lastWeekKey: body.lastWeekKey ?? prev.lastWeekKey,
                defaultEmail: body.defaultEmail ?? prev.defaultEmail,
              }
            : (body as MarketDigestConfig),
        );
      }
      setMessage(
        `Test sent to ${body.to ?? email}${body.subject ? ` — ${body.subject}` : ""}`,
      );
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Send failed");
    } finally {
      setSending(false);
    }
  };

  return (
    <div
      id="admin-market-digest"
      className="scroll-mt-24 rounded-2xl border border-charcoal/[0.08] bg-white shadow-sm overflow-hidden"
    >
      <div className="px-5 sm:px-6 py-4 border-b border-charcoal/[0.08] bg-cream/40">
        <p className="font-mono text-[11px] tracking-[0.2em] uppercase text-gold">
          Monday market brief
        </p>
        <p className="mt-1 text-sm text-slate max-w-3xl">
          Weekly email every Monday morning (~8am Eastern): months supply,
          inventory by town, an explanation of the months-supply formula, and
          the current Deal of the Week (shareable graphic for social comes
          next). Requires{" "}
          <span className="font-mono text-[11px]">RESEND_API_KEY</span>.
        </p>
      </div>
      <div className="px-5 sm:px-6 py-4 space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1">
            <span className="font-mono text-[10px] tracking-[0.16em] uppercase text-charcoal/50">
              Digest email
            </span>
            <input
              type="email"
              inputMode="email"
              value={email}
              placeholder={config?.defaultEmail}
              onChange={(e) => setEmail(e.target.value)}
              className="w-72 max-w-full rounded-lg border border-charcoal/15 px-3 py-2 font-mono text-sm text-navy focus:border-navy focus:outline-none"
            />
          </label>
          <label className="inline-flex items-center gap-2 pb-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
              className="rounded border-charcoal/30"
            />
            <span className="font-mono text-[10px] tracking-[0.12em] uppercase text-charcoal/70">
              Enabled
            </span>
          </label>
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving || !dirty}
            className="font-mono text-[10px] tracking-[0.12em] uppercase rounded-full px-4 py-2 border border-navy/30 text-navy bg-cream/40 hover:bg-cream disabled:opacity-40 disabled:pointer-events-none transition-colors"
          >
            {saving ? "Saving…" : "Save"}
          </button>
          <button
            type="button"
            onClick={() => void sendTest()}
            disabled={sending}
            className="font-mono text-[10px] tracking-[0.12em] uppercase rounded-full px-4 py-2 border border-gold/40 text-navy bg-gold/10 hover:bg-gold/20 disabled:opacity-40 disabled:pointer-events-none transition-colors"
          >
            {sending ? "Sending…" : "Send test now"}
          </button>
        </div>
        {config ? (
          <p className="font-mono text-[10px] text-charcoal/45">
            last sent{" "}
            {config.lastSentAt
              ? new Date(config.lastSentAt).toLocaleString()
              : "never"}
            {config.lastWeekKey ? ` · week ${config.lastWeekKey}` : ""}
          </p>
        ) : null}
        {message ? (
          <p className="font-mono text-[10px] text-sage">{message}</p>
        ) : null}
      </div>
    </div>
  );
}
