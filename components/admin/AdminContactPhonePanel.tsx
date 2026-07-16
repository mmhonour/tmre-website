"use client";

import { useEffect, useState } from "react";

type ContactPhone = {
  phone: string;
  display: string;
  default: string;
  defaultDisplay?: string;
};

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
 * Admin control for the public phone number shown in the site's phone CTA
 * (nav, profile popover, contact page) and business schema. Stored in sync_meta
 * (raw digits) — no redeploy needed.
 */
export default function AdminContactPhonePanel({
  initial,
}: {
  initial?: ContactPhone;
}) {
  const [config, setConfig] = useState<ContactPhone | null>(initial ?? null);
  const [value, setValue] = useState<string>(initial ? initial.display : "");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (initial) return;
    let cancelled = false;
    fetch("/api/admin/contact-phone", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((body: ContactPhone | null) => {
        if (cancelled || !body) return;
        setConfig(body);
        setValue(body.display);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [initial]);

  const digits = normalizeDigits(value);
  const valid = digits.length === 10;

  const save = async () => {
    if (!valid) {
      setMessage("Enter a valid 10-digit US phone number");
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/contact-phone", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ phone: digits }),
      });
      const body = (await res.json()) as ContactPhone & {
        ok?: boolean;
        error?: string;
      };
      if (!res.ok) {
        setMessage(body.error ?? "Save failed");
        return;
      }
      setConfig(body);
      setValue(body.display);
      setMessage(`Saved — phone now shows as ${body.display}`);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const dirty = config != null && normalizeDigits(config.phone) !== digits;

  return (
    <div
      id="admin-contact-phone"
      className="scroll-mt-24 rounded-2xl border border-charcoal/[0.08] bg-white shadow-sm overflow-hidden"
    >
      <div className="px-5 sm:px-6 py-4 border-b border-charcoal/[0.08] bg-cream/40">
        <p className="font-mono text-[11px] tracking-[0.2em] uppercase text-gold">
          Contact phone number
        </p>
        <p className="mt-1 text-sm text-slate max-w-2xl">
          The public phone number shown in the site&rsquo;s phone button (nav
          and profile popover), on the contact page, and in the business
          listing data. On desktop the number is revealed on click; on phones it
          dials directly. Stored durably — no redeploy needed.
        </p>
      </div>
      <div className="px-5 sm:px-6 py-4">
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1">
            <span className="font-mono text-[10px] tracking-[0.16em] uppercase text-charcoal/50">
              Phone number
            </span>
            <input
              type="tel"
              inputMode="tel"
              value={value}
              placeholder={config?.defaultDisplay ?? "(617) 504-0741"}
              onChange={(e) => setValue(e.target.value)}
              onBlur={() => setValue((v) => formatDisplay(v))}
              className="w-56 max-w-full rounded-lg border border-charcoal/15 px-3 py-2 font-mono text-sm text-navy focus:border-navy focus:outline-none"
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
              current {config.display} · default{" "}
              {config.defaultDisplay ?? config.default}
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
