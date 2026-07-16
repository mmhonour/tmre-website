"use client";

import { useEffect, useState } from "react";

type ContactEmail = {
  email: string;
  default: string;
};

function isValidEmail(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 254) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed);
}

/**
 * Admin control for the destination address of every contact/lead form on the
 * site. Stored in sync_meta (no redeploy needed). When set, all form
 * notifications are emailed here; otherwise the CONTACT_NOTIFY_EMAIL env var or
 * the built-in default is used.
 */
export default function AdminContactEmailPanel({
  initial,
}: {
  initial?: ContactEmail;
}) {
  const [config, setConfig] = useState<ContactEmail | null>(initial ?? null);
  const [value, setValue] = useState<string>(initial ? initial.email : "");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (initial) return;
    let cancelled = false;
    fetch("/api/admin/contact-email", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((body: ContactEmail | null) => {
        if (cancelled || !body) return;
        setConfig(body);
        setValue(body.email);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [initial]);

  const save = async () => {
    const trimmed = value.trim();
    if (!isValidEmail(trimmed)) {
      setMessage("Enter a valid email address");
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/contact-email", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: trimmed }),
      });
      const body = (await res.json()) as ContactEmail & {
        ok?: boolean;
        error?: string;
      };
      if (!res.ok) {
        setMessage(body.error ?? "Save failed");
        return;
      }
      setConfig(body);
      setValue(body.email);
      setMessage(`Saved — forms now notify ${body.email}`);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const dirty = config != null && config.email !== value.trim();

  return (
    <div
      id="admin-contact-email"
      className="scroll-mt-24 rounded-2xl border border-charcoal/[0.08] bg-white shadow-sm overflow-hidden"
    >
      <div className="px-5 sm:px-6 py-4 border-b border-charcoal/[0.08] bg-cream/40">
        <p className="font-mono text-[11px] tracking-[0.2em] uppercase text-gold">
          Contact form email
        </p>
        <p className="mt-1 text-sm text-slate max-w-2xl">
          The destination address for every contact and lead form on the site.
          Submissions are always saved; when this is set (and a Resend API key is
          configured) a notification is also emailed here. Stored durably — no
          redeploy needed.
        </p>
      </div>
      <div className="px-5 sm:px-6 py-4">
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1">
            <span className="font-mono text-[10px] tracking-[0.16em] uppercase text-charcoal/50">
              Notify email
            </span>
            <input
              type="email"
              inputMode="email"
              value={value}
              placeholder={config?.default}
              onChange={(e) => setValue(e.target.value)}
              className="w-72 max-w-full rounded-lg border border-charcoal/15 px-3 py-2 font-mono text-sm text-navy focus:border-navy focus:outline-none"
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
          {config ? (
            <p className="font-mono text-[10px] text-charcoal/45 pb-2">
              current {config.email} · default {config.default}
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
