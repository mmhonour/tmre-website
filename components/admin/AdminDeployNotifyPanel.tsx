"use client";

import { useEffect, useState } from "react";
import type { DeployNotifyConfig } from "@/lib/deploy-notify-shared";

function isValidEmail(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 254) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed);
}

function normalizeDigits(input: string): string {
  let digits = (input || "").replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) digits = digits.slice(1);
  return digits;
}

function formatDisplay(input: string): string {
  const d = normalizeDigits(input);
  if (d.length !== 10) return input;
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
}

/**
 * Notify when Netlify finishes a production (main) deploy.
 * Email via Resend; SMS via Twilio. Wire Netlify outgoing webhook → webhookPath.
 */
export default function AdminDeployNotifyPanel({
  initial,
}: {
  initial?: DeployNotifyConfig;
}) {
  const [config, setConfig] = useState<DeployNotifyConfig | null>(initial ?? null);
  const [enabled, setEnabled] = useState(initial?.enabled ?? true);
  const [emailEnabled, setEmailEnabled] = useState(initial?.emailEnabled ?? false);
  const [smsEnabled, setSmsEnabled] = useState(initial?.smsEnabled ?? true);
  const [email, setEmail] = useState(initial?.email ?? "");
  const [phone, setPhone] = useState(initial?.phoneDisplay ?? "");
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (initial) return;
    let cancelled = false;
    fetch("/api/admin/deploy-notify", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((body: DeployNotifyConfig | null) => {
        if (cancelled || !body) return;
        setConfig(body);
        setEnabled(body.enabled);
        setEmailEnabled(body.emailEnabled);
        setSmsEnabled(body.smsEnabled);
        setEmail(body.email);
        setPhone(body.phoneDisplay || body.phone);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [initial]);

  const phoneDigits = normalizeDigits(phone);
  const dirty =
    config != null &&
    (config.enabled !== enabled ||
      config.emailEnabled !== emailEnabled ||
      config.smsEnabled !== smsEnabled ||
      config.email !== email.trim() ||
      normalizeDigits(config.phone) !== phoneDigits);

  const save = async () => {
    if (emailEnabled && !isValidEmail(email.trim())) {
      setMessage("Enter a valid email address (or turn email off)");
      return;
    }
    if (smsEnabled && phoneDigits.length !== 10) {
      setMessage("Enter a valid 10-digit US phone (or turn text off)");
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/deploy-notify", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          enabled,
          emailEnabled,
          smsEnabled,
          email: email.trim(),
          phone: phoneDigits.length === 10 ? phoneDigits : undefined,
        }),
      });
      const body = (await res.json()) as DeployNotifyConfig & {
        ok?: boolean;
        error?: string;
      };
      if (!res.ok) {
        setMessage(body.error ?? "Save failed");
        return;
      }
      setConfig(body);
      setEnabled(body.enabled);
      setEmailEnabled(body.emailEnabled);
      setSmsEnabled(body.smsEnabled);
      setEmail(body.email);
      setPhone(body.phoneDisplay || body.phone);
      setMessage("Saved — deploy notify preferences updated");
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
      const res = await fetch("/api/admin/deploy-notify", { method: "POST" });
      const body = (await res.json()) as DeployNotifyConfig & {
        ok?: boolean;
        error?: string;
        reason?: string;
        emailSent?: boolean;
        smsSent?: boolean;
        subject?: string;
      };
      if (body.email != null) {
        setConfig((prev) =>
          prev
            ? {
                ...prev,
                ...body,
                email: body.email ?? prev.email,
                phone: body.phone ?? prev.phone,
                phoneDisplay: body.phoneDisplay ?? prev.phoneDisplay,
                lastNotifiedAt: body.lastNotifiedAt ?? prev.lastNotifiedAt,
              }
            : (body as DeployNotifyConfig),
        );
      }
      if (!res.ok || body.ok === false) {
        setMessage(body.error ?? body.reason ?? "Test send failed");
        return;
      }
      const parts = [
        body.smsSent ? "text sent" : null,
        body.emailSent ? "email sent" : null,
      ].filter(Boolean);
      setMessage(
        parts.length
          ? `Test OK — ${parts.join(" + ")}${body.subject ? ` (${body.subject})` : ""}`
          : body.reason ?? "Test skipped",
      );
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Test send failed");
    } finally {
      setSending(false);
    }
  };

  const webhookPath = config?.webhookPath ?? "/api/webhooks/netlify-deploy";

  return (
    <div
      id="admin-deploy-notify"
      className="scroll-mt-24 rounded-2xl border border-charcoal/[0.08] bg-white shadow-sm overflow-hidden"
    >
      <div className="px-5 sm:px-6 py-4 border-b border-charcoal/[0.08] bg-cream/40">
        <p className="font-mono text-[11px] tracking-[0.2em] uppercase text-gold">
          Deploy notifications
        </p>
        <p className="mt-1 text-sm text-slate max-w-3xl">
          Ping you when Netlify finishes a{" "}
          <span className="font-mono text-[11px]">main</span> production deploy
          (after a push). Prefer text — turn SMS on below. Email uses Resend;
          text uses Twilio. This is separate from the public Contact phone
          number.
        </p>
      </div>
      <div className="px-5 sm:px-6 py-4 space-y-4">
        <label className="inline-flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
            className="rounded border-charcoal/30"
          />
          <span className="font-mono text-[11px] tracking-[0.12em] uppercase text-navy">
            Enabled
          </span>
        </label>

        <div className="flex flex-wrap gap-4">
          <label className="inline-flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={smsEnabled}
              onChange={(e) => setSmsEnabled(e.target.checked)}
              className="rounded border-charcoal/30"
            />
            <span className="text-sm text-navy">Text (SMS)</span>
            <span
              className={`font-mono text-[9px] tracking-[0.12em] uppercase ${
                config?.twilioConfigured ? "text-sage" : "text-coral"
              }`}
            >
              {config?.twilioConfigured ? "Twilio ready" : "needs TWILIO_* env"}
            </span>
          </label>
          <label className="inline-flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={emailEnabled}
              onChange={(e) => setEmailEnabled(e.target.checked)}
              className="rounded border-charcoal/30"
            />
            <span className="text-sm text-navy">Email</span>
            <span
              className={`font-mono text-[9px] tracking-[0.12em] uppercase ${
                config?.resendConfigured ? "text-sage" : "text-coral"
              }`}
            >
              {config?.resendConfigured ? "Resend ready" : "needs RESEND_API_KEY"}
            </span>
          </label>
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1">
            <span className="font-mono text-[10px] tracking-[0.16em] uppercase text-charcoal/50">
              SMS phone
            </span>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(formatDisplay(e.target.value))}
              placeholder={config?.defaultPhoneDisplay}
              className="w-56 rounded-lg border border-charcoal/15 px-3 py-2 font-mono text-sm text-navy focus:border-navy focus:outline-none"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="font-mono text-[10px] tracking-[0.16em] uppercase text-charcoal/50">
              Email
            </span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={config?.defaultEmail}
              className="w-72 rounded-lg border border-charcoal/15 px-3 py-2 font-mono text-sm text-navy focus:border-navy focus:outline-none"
            />
          </label>
        </div>

        <div className="rounded-lg border border-charcoal/[0.08] bg-cream/30 px-3 py-3 space-y-2">
          <p className="font-mono text-[10px] tracking-[0.16em] uppercase text-charcoal/50">
            Netlify setup (once)
          </p>
          <ol className="list-decimal pl-5 text-sm text-slate space-y-1">
            <li>
              Site settings → Notifications → Outgoing webhook → Deploy
              succeeded (and Deploy failed if you want).
            </li>
            <li>
              URL:{" "}
              <span className="font-mono text-[11px] text-navy break-all">
                https://&lt;your-site&gt;{webhookPath}
              </span>
            </li>
            <li>
              Set Netlify env{" "}
              <span className="font-mono text-[11px]">DEPLOY_NOTIFY_WEBHOOK_SECRET</span>{" "}
              and send it as{" "}
              <span className="font-mono text-[11px]">Authorization: Bearer …</span>{" "}
              (or{" "}
              <span className="font-mono text-[11px]">?secret=…</span>).
            </li>
            <li>
              For SMS also set{" "}
              <span className="font-mono text-[11px]">
                TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_FROM_NUMBER
              </span>
              .
            </li>
          </ol>
        </div>

        {config?.lastNotifiedAt ? (
          <p className="font-mono text-[10px] text-charcoal/45">
            Last notified: {new Date(config.lastNotifiedAt).toLocaleString()}
          </p>
        ) : null}

        <div className="flex flex-wrap items-center gap-3">
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
            disabled={sending || dirty}
            className="font-mono text-[10px] tracking-[0.12em] uppercase rounded-full px-4 py-2 border border-gold/40 text-navy hover:bg-gold/10 disabled:opacity-40 disabled:pointer-events-none transition-colors"
            title={dirty ? "Save changes first" : "Send a test notification now"}
          >
            {sending ? "Sending…" : "Send test"}
          </button>
          {message ? (
            <p className="font-mono text-[10px] text-sage max-w-xl">{message}</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
