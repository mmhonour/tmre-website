"use client";

import { useEffect, useState } from "react";
import {
  DEFAULT_MARKET_DIGEST_SUBJECT_TEMPLATE,
  type MarketDigestConfig,
} from "@/lib/market-digest-shared";

function isValidEmail(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 254) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed);
}

function previewSubject(template: string): string {
  const sample = "Monday, August 3, 2026";
  const base = template.trim() || DEFAULT_MARKET_DIGEST_SUBJECT_TEMPLATE;
  return base.replaceAll("{date}", sample);
}

/**
 * Monday morning months-supply / inventory email + Deal of the Week note.
 * Cron: Netlify market-digest (Mon ~8am ET) — separate from MLS incremental sync.
 */
export default function AdminMarketDigestPanel({
  initial,
}: {
  initial?: MarketDigestConfig;
}) {
  const [config, setConfig] = useState<MarketDigestConfig | null>(initial ?? null);
  const [email, setEmail] = useState(initial?.email ?? "");
  const [enabled, setEnabled] = useState(initial?.enabled ?? true);
  const [subjectTemplate, setSubjectTemplate] = useState(
    initial?.subjectTemplate ?? DEFAULT_MARKET_DIGEST_SUBJECT_TEMPLATE,
  );
  const [includeSocialProfiles, setIncludeSocialProfiles] = useState(
    initial?.includeSocialProfiles ?? false,
  );
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
        setSubjectTemplate(body.subjectTemplate);
        setIncludeSocialProfiles(body.includeSocialProfiles);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [initial]);

  const dirty =
    config != null &&
    (config.email !== email.trim() ||
      config.enabled !== enabled ||
      config.subjectTemplate !== subjectTemplate.trim() ||
      config.includeSocialProfiles !== includeSocialProfiles);

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
        body: JSON.stringify({
          email: trimmed,
          enabled,
          subjectTemplate: subjectTemplate.trim(),
          includeSocialProfiles,
        }),
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
      setSubjectTemplate(body.subjectTemplate);
      setIncludeSocialProfiles(body.includeSocialProfiles);
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
                subjectTemplate:
                  body.subjectTemplate ?? prev.subjectTemplate,
                includeSocialProfiles:
                  body.includeSocialProfiles ?? prev.includeSocialProfiles,
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
          Weekly HTML email every Monday morning (~8am Eastern) via its own
          Netlify cron — not the MLS incremental sync. Inventory / months-supply
          bars, DOTW card, plain-text fallback. Requires{" "}
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

        <label className="flex flex-col gap-1 max-w-xl">
          <span className="font-mono text-[10px] tracking-[0.16em] uppercase text-charcoal/50">
            Email subject
          </span>
          <input
            type="text"
            value={subjectTemplate}
            onChange={(e) => setSubjectTemplate(e.target.value)}
            placeholder={DEFAULT_MARKET_DIGEST_SUBJECT_TEMPLATE}
            className="w-full rounded-lg border border-charcoal/15 px-3 py-2 font-mono text-sm text-navy focus:border-navy focus:outline-none"
          />
          <span className="font-mono text-[10px] text-charcoal/40">
            Use {"{date}"} for the Eastern long date. Preview:{" "}
            <span className="text-charcoal/65">
              {previewSubject(subjectTemplate)}
            </span>
          </span>
        </label>

        <label className="inline-flex items-start gap-2 cursor-pointer select-none max-w-xl">
          <input
            type="checkbox"
            checked={includeSocialProfiles}
            onChange={(e) => setIncludeSocialProfiles(e.target.checked)}
            className="mt-0.5 rounded border-charcoal/30"
          />
          <span>
            <span className="font-mono text-[10px] tracking-[0.12em] uppercase text-charcoal/70">
              Include social profiles in email
            </span>
            <span className="mt-0.5 block text-xs text-slate">
              Off by default. When on, appends Admin → Communications → Social
              profiles at the bottom of the brief.
            </span>
          </span>
        </label>

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
