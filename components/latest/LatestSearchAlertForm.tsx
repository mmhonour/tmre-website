"use client";

import { useEffect, useMemo, useState } from "react";
import {
  listUniqueVisitorSearches,
  type VisitorSearchProfileEntry,
} from "@/lib/visitor-search-profile";

type Cadence = "immediate" | "daily" | "weekly";
type Channel = "email" | "sms";

const WEEKDAYS = [
  { value: 0, label: "Sunday" },
  { value: 1, label: "Monday" },
  { value: 2, label: "Tuesday" },
  { value: 3, label: "Wednesday" },
  { value: 4, label: "Thursday" },
  { value: 5, label: "Friday" },
  { value: 6, label: "Saturday" },
] as const;

/**
 * Create a listing alert from unique searches stored in the visitor's filter
 * cookies / search-history cookie. Email works now; SMS is disabled pending
 * Twilio + A2P (see search-alerts whiteboard).
 */
export default function LatestSearchAlertForm() {
  const [searches, setSearches] = useState<VisitorSearchProfileEntry[]>([]);
  const [fingerprint, setFingerprint] = useState("");
  const [channel, setChannel] = useState<Channel>("email");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [cadence, setCadence] = useState<Cadence>("immediate");
  const [dailyTime, setDailyTime] = useState("09:00");
  const [weeklyDay, setWeeklyDay] = useState(1);
  const [weeklyTime, setWeeklyTime] = useState("09:00");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const list = listUniqueVisitorSearches();
    setSearches(list);
    if (list[0]) setFingerprint(list[0].fingerprint);
  }, []);

  const selected = useMemo(
    () => searches.find((s) => s.fingerprint === fingerprint) ?? null,
    [searches, fingerprint],
  );

  const submit = async () => {
    setError(null);
    setMessage(null);
    if (!selected) {
      setError(
        "No saved searches yet — filter listings on Intelligence or Find, then come back.",
      );
      return;
    }
    if (channel === "sms") {
      setError(
        "Text alerts are not available yet. Use email for now — SMS is on the roadmap (Twilio + A2P registration).",
      );
      return;
    }
    if (!email.trim()) {
      setError("Enter the email address that should receive matches.");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/saved-searches", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          criteria: selected.criteria,
          channel,
          email: email.trim(),
          phone: phone.trim() || null,
          cadence,
          dailyTimeEt: cadence === "daily" ? dailyTime : null,
          weeklyDay: cadence === "weekly" ? weeklyDay : null,
          weeklyTimeEt: cadence === "weekly" ? weeklyTime : null,
        }),
      });
      const body = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok) {
        setError(body.error ?? "Could not save alert");
        return;
      }
      setMessage(
        cadence === "immediate"
          ? "Alert saved — we'll email you when a new listing matches (checked every ~30 minutes)."
          : cadence === "daily"
            ? `Alert saved — daily digest at ${dailyTime} ET when there are new matches.`
            : `Alert saved — weekly digest ${WEEKDAYS.find((d) => d.value === weeklyDay)?.label} at ${weeklyTime} ET when there are new matches.`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save alert");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section
      id="latest-alerts"
      className="rounded-2xl border border-charcoal/[0.08] bg-white shadow-sm overflow-hidden"
    >
      <div className="px-5 sm:px-6 py-4 border-b border-charcoal/[0.08] bg-cream/40">
        <p className="font-mono text-[11px] tracking-[0.2em] uppercase text-gold">
          Listing alerts
        </p>
        <p className="mt-1 text-sm text-slate max-w-2xl">
          Build an alert from searches you&rsquo;ve already run on the site
          (stored in your browser). When a new home matches, we can email you —
          text is coming later.
        </p>
      </div>

      <div className="px-5 sm:px-6 py-5 space-y-4">
        {searches.length === 0 ? (
          <p className="text-sm text-slate">
            No unique searches yet. Set filters on{" "}
            <a href="/intelligence" className="text-navy underline underline-offset-2">
              Intelligence
            </a>{" "}
            or{" "}
            <a href="/find" className="text-navy underline underline-offset-2">
              Find
            </a>
            , then return here — your criteria will show up automatically.
          </p>
        ) : (
          <label className="flex flex-col gap-1">
            <span className="font-mono text-[10px] tracking-[0.16em] uppercase text-charcoal/50">
              Your search
            </span>
            <select
              value={fingerprint}
              onChange={(e) => setFingerprint(e.target.value)}
              className="w-full rounded-lg border border-charcoal/15 px-3 py-2 text-sm text-navy focus:border-navy focus:outline-none bg-white"
            >
              {searches.map((s) => (
                <option key={s.fingerprint} value={s.fingerprint}>
                  {s.label}
                  {s.useCount > 1 ? ` · used ${s.useCount}×` : ""}
                </option>
              ))}
            </select>
          </label>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <fieldset className="space-y-2">
            <legend className="font-mono text-[10px] tracking-[0.16em] uppercase text-charcoal/50">
              Notify by
            </legend>
            <div className="flex flex-wrap gap-2">
              <ChannelPill
                active={channel === "email"}
                onClick={() => setChannel("email")}
                label="Email"
              />
              <ChannelPill
                active={channel === "sms"}
                onClick={() => setChannel("sms")}
                label="Text"
                muted
              />
            </div>
            {channel === "sms" ? (
              <p className="text-xs text-coral/90">
                Texting isn&rsquo;t wired yet (no SMS provider). Use email, or
                ask for the Twilio + A2P plan when you&rsquo;re ready to enable
                it.
              </p>
            ) : null}
          </fieldset>

          <fieldset className="space-y-2">
            <legend className="font-mono text-[10px] tracking-[0.16em] uppercase text-charcoal/50">
              When
            </legend>
            <div className="flex flex-wrap gap-2">
              {(
                [
                  ["immediate", "As new matches appear"],
                  ["daily", "Once a day"],
                  ["weekly", "Once a week"],
                ] as const
              ).map(([value, label]) => (
                <ChannelPill
                  key={value}
                  active={cadence === value}
                  onClick={() => setCadence(value)}
                  label={label}
                />
              ))}
            </div>
          </fieldset>
        </div>

        {cadence === "daily" ? (
          <label className="flex flex-col gap-1 max-w-[12rem]">
            <span className="font-mono text-[10px] tracking-[0.16em] uppercase text-charcoal/50">
              Time (Eastern)
            </span>
            <input
              type="time"
              value={dailyTime}
              onChange={(e) => setDailyTime(e.target.value)}
              className="rounded-lg border border-charcoal/15 px-3 py-2 text-sm text-navy focus:border-navy focus:outline-none"
            />
          </label>
        ) : null}

        {cadence === "weekly" ? (
          <div className="flex flex-wrap gap-3">
            <label className="flex flex-col gap-1">
              <span className="font-mono text-[10px] tracking-[0.16em] uppercase text-charcoal/50">
                Day
              </span>
              <select
                value={weeklyDay}
                onChange={(e) => setWeeklyDay(Number(e.target.value))}
                className="rounded-lg border border-charcoal/15 px-3 py-2 text-sm text-navy focus:border-navy focus:outline-none bg-white"
              >
                {WEEKDAYS.map((d) => (
                  <option key={d.value} value={d.value}>
                    {d.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="font-mono text-[10px] tracking-[0.16em] uppercase text-charcoal/50">
                Time (Eastern)
              </span>
              <input
                type="time"
                value={weeklyTime}
                onChange={(e) => setWeeklyTime(e.target.value)}
                className="rounded-lg border border-charcoal/15 px-3 py-2 text-sm text-navy focus:border-navy focus:outline-none"
              />
            </label>
          </div>
        ) : null}

        {channel === "email" ? (
          <label className="flex flex-col gap-1 max-w-md">
            <span className="font-mono text-[10px] tracking-[0.16em] uppercase text-charcoal/50">
              Email
            </span>
            <input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="rounded-lg border border-charcoal/15 px-3 py-2 text-sm text-navy focus:border-navy focus:outline-none"
            />
          </label>
        ) : (
          <label className="flex flex-col gap-1 max-w-md">
            <span className="font-mono text-[10px] tracking-[0.16em] uppercase text-charcoal/50">
              Mobile (for later)
            </span>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="(203) 555-0100"
              disabled
              className="rounded-lg border border-charcoal/15 px-3 py-2 text-sm text-navy/40 bg-cream/50 cursor-not-allowed"
            />
          </label>
        )}

        <div className="flex flex-wrap items-center gap-3 pt-1">
          <button
            type="button"
            onClick={() => void submit()}
            disabled={saving || searches.length === 0 || channel === "sms"}
            className="font-mono text-[10px] tracking-[0.12em] uppercase rounded-full px-5 py-2.5 border border-navy/30 text-navy bg-cream/40 hover:bg-cream disabled:opacity-40 disabled:pointer-events-none transition-colors"
          >
            {saving ? "Saving…" : "Save alert"}
          </button>
          {message ? (
            <p className="text-sm text-sage">{message}</p>
          ) : null}
          {error ? <p className="text-sm text-coral">{error}</p> : null}
        </div>
      </div>
    </section>
  );
}

function ChannelPill({
  active,
  onClick,
  label,
  muted,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  muted?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`font-mono text-[10px] tracking-[0.12em] uppercase rounded-full px-3 py-1.5 border transition-colors ${
        active
          ? "border-navy bg-navy text-white"
          : muted
            ? "border-charcoal/15 text-charcoal/40 hover:border-charcoal/25"
            : "border-charcoal/20 text-navy/80 hover:border-navy/40"
      }`}
    >
      {label}
      {muted ? " · soon" : ""}
    </button>
  );
}
