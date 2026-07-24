"use client";

import { useEffect, useState } from "react";
import {
  DEFAULT_SOCIAL_PROFILES,
  type SocialProfileSlot,
  type SocialProfilesConfig,
} from "@/lib/social-profiles-shared";

type Payload = SocialProfilesConfig & {
  default: SocialProfilesConfig;
};

/**
 * Admin slots for social account profiles. Handles are stored now; API posting
 * will connect later for the Monday market brief / Deal of the Week graphic.
 */
export default function AdminSocialProfilesPanel({
  initial,
}: {
  initial?: SocialProfilesConfig;
}) {
  const [profiles, setProfiles] = useState<SocialProfileSlot[]>(
    initial?.profiles ?? DEFAULT_SOCIAL_PROFILES.profiles,
  );
  const [baseline, setBaseline] = useState<SocialProfileSlot[]>(
    initial?.profiles ?? DEFAULT_SOCIAL_PROFILES.profiles,
  );
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (initial) return;
    let cancelled = false;
    fetch("/api/admin/social-profiles", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((body: Payload | null) => {
        if (cancelled || !body?.profiles) return;
        setProfiles(body.profiles);
        setBaseline(body.profiles);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [initial]);

  const update = (index: number, patch: Partial<SocialProfileSlot>) => {
    setProfiles((prev) =>
      prev.map((row, i) => (i === index ? { ...row, ...patch } : row)),
    );
  };

  const dirty = JSON.stringify(profiles) !== JSON.stringify(baseline);

  const save = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/social-profiles", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ profiles }),
      });
      const body = (await res.json()) as Payload & { ok?: boolean; error?: string };
      if (!res.ok) {
        setMessage(body.error ?? "Save failed");
        return;
      }
      setProfiles(body.profiles);
      setBaseline(body.profiles);
      setMessage("Saved — profiles ready for future social posting");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      id="admin-social-profiles"
      className="scroll-mt-24 rounded-2xl border border-charcoal/[0.08] bg-white shadow-sm overflow-hidden"
    >
      <div className="px-5 sm:px-6 py-4 border-b border-charcoal/[0.08] bg-cream/40">
        <p className="font-mono text-[11px] tracking-[0.2em] uppercase text-gold">
          Social media profiles
        </p>
        <p className="mt-1 text-sm text-slate max-w-3xl">
          Account slots for Instagram, LinkedIn, or other networks. Save handles
          or profile URLs here now; later these will connect so the Monday market
          brief and Deal of the Week graphic can post automatically.
        </p>
      </div>
      <div className="px-5 sm:px-6 py-4 space-y-5">
        {profiles.map((row, index) => (
          <div
            key={row.id}
            className="grid gap-3 sm:grid-cols-[minmax(0,10rem)_minmax(0,1fr)]"
          >
            <label className="flex flex-col gap-1">
              <span className="font-mono text-[10px] tracking-[0.16em] uppercase text-charcoal/50">
                Profile {index + 1} label
              </span>
              <input
                type="text"
                value={row.label}
                onChange={(e) => update(index, { label: e.target.value })}
                className="w-full rounded-lg border border-charcoal/15 px-3 py-2 font-mono text-sm text-navy focus:border-navy focus:outline-none"
                placeholder={DEFAULT_SOCIAL_PROFILES.profiles[index]?.label}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="font-mono text-[10px] tracking-[0.16em] uppercase text-charcoal/50">
                Handle or profile URL
              </span>
              <input
                type="text"
                value={row.handleOrUrl}
                onChange={(e) => update(index, { handleOrUrl: e.target.value })}
                className="w-full rounded-lg border border-charcoal/15 px-3 py-2 font-mono text-sm text-navy focus:border-navy focus:outline-none"
                placeholder="@yourbrand or https://…"
              />
            </label>
            <label className="flex flex-col gap-1 sm:col-span-2">
              <span className="font-mono text-[10px] tracking-[0.16em] uppercase text-charcoal/50">
                Notes
              </span>
              <input
                type="text"
                value={row.notes}
                onChange={(e) => update(index, { notes: e.target.value })}
                className="w-full rounded-lg border border-charcoal/15 px-3 py-2 text-sm text-navy focus:border-navy focus:outline-none"
                placeholder="Audience, cadence, or posting prefs"
              />
            </label>
          </div>
        ))}
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving || !dirty}
            className="font-mono text-[10px] tracking-[0.12em] uppercase rounded-full px-4 py-2 border border-navy/30 text-navy bg-cream/40 hover:bg-cream disabled:opacity-40 disabled:pointer-events-none transition-colors"
          >
            {saving ? "Saving…" : "Save profiles"}
          </button>
          {message ? (
            <p className="font-mono text-[10px] text-sage">{message}</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
