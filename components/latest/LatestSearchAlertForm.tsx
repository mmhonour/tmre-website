"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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

const LINK_BTN =
  "shrink-0 bg-transparent p-0 m-0 border-0 cursor-pointer font-mono text-[11px] tracking-[0.12em] uppercase text-navy underline decoration-navy/25 underline-offset-2 hover:text-gold hover:decoration-gold/50 transition-colors";

/**
 * Create a listing alert from unique searches stored in the visitor's filter
 * cookies / search-history cookie. Email works now; SMS is disabled pending
 * Twilio + A2P (see search-alerts whiteboard).
 *
 * Compact inlaid pop-out — trigger is a flat link; the form floats over the feed.
 */
export default function LatestSearchAlertForm() {
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
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

  const loadSearches = () => {
    const list = listUniqueVisitorSearches();
    setSearches(list);
    // Default to the most common search (list is frequency-sorted).
    if (list[0]) setFingerprint(list[0].fingerprint);
  };

  useEffect(() => {
    loadSearches();
  }, []);

  // Prefill email from passwordless session when available.
  useEffect(() => {
    void fetch("/api/auth/me", { cache: "no-store" })
      .then((r) => r.json())
      .then((body: { authenticated?: boolean; user?: { email?: string } }) => {
        if (body.authenticated && body.user?.email) {
          setEmail((prev) => prev || body.user!.email!);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!open) return;
    loadSearches();
    const onPointer = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

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
        (cadence === "immediate"
          ? "Alert saved — we'll email you when a new listing matches (checked every ~30 minutes)."
          : cadence === "daily"
            ? `Alert saved — daily digest at ${dailyTime} ET when there are new matches.`
            : `Alert saved — weekly digest ${WEEKDAYS.find((d) => d.value === weeklyDay)?.label} at ${weeklyTime} ET when there are new matches.`) +
          " Confirmation emailed to you; Timothy was notified too.",
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save alert");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div id="latest-alerts" ref={rootRef} className="relative inline-flex">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls="latest-alerts-panel"
        className={LINK_BTN}
      >
        Listing alerts{open ? " · close" : ""}
      </button>

      {open ? (
        <div
          id="latest-alerts-panel"
          role="dialog"
          aria-label="Listing alerts"
          className="absolute left-0 top-full z-30 mt-2 w-[min(22rem,calc(100vw-2.5rem))] rounded-xl border border-charcoal/15 bg-cream shadow-[0_12px_32px_rgba(28,42,58,0.18)]"
        >
          <div className="px-3.5 py-3 space-y-3">
            <p className="text-xs text-slate leading-snug">
              Alert from a search you&rsquo;ve already run. Email when a new home
              matches — text coming later.
            </p>

            {searches.length === 0 ? (
              <p className="text-xs text-slate leading-snug">
                No searches yet. Filter on{" "}
                <a
                  href="/intelligence"
                  className="text-navy underline underline-offset-2"
                >
                  Intelligence
                </a>{" "}
                or{" "}
                <a href="/find" className="text-navy underline underline-offset-2">
                  Find
                </a>
                , then return.
              </p>
            ) : (
              <label className="flex flex-col gap-1">
                <span className="font-mono text-[10px] tracking-[0.16em] uppercase text-charcoal/50">
                  Your most common search
                </span>
                <select
                  value={fingerprint}
                  onChange={(e) => setFingerprint(e.target.value)}
                  className="w-full rounded-md border border-charcoal/15 px-2.5 py-1.5 text-xs text-navy focus:border-navy focus:outline-none bg-white"
                >
                  {searches.map((s, i) => (
                    <option key={s.fingerprint} value={s.fingerprint}>
                      {s.label}
                      {i === 0 ? " · most used" : ""}
                      {s.useCount > 1 ? ` · ${s.useCount}×` : ""}
                    </option>
                  ))}
                </select>
              </label>
            )}

            <div className="grid gap-3">
              <fieldset className="space-y-1.5">
                <legend className="font-mono text-[10px] tracking-[0.16em] uppercase text-charcoal/50">
                  Notify by
                </legend>
                <div className="flex flex-wrap gap-1.5">
                  <ChannelChip
                    active={channel === "email"}
                    onClick={() => setChannel("email")}
                    label="Email"
                  />
                  <ChannelChip
                    active={channel === "sms"}
                    onClick={() => setChannel("sms")}
                    label="Text"
                    muted
                  />
                </div>
                {channel === "sms" ? (
                  <p className="text-[11px] text-coral/90 leading-snug">
                    Texting isn&rsquo;t wired yet. Use email for now.
                  </p>
                ) : null}
              </fieldset>

              <fieldset className="space-y-1.5">
                <legend className="font-mono text-[10px] tracking-[0.16em] uppercase text-charcoal/50">
                  When
                </legend>
                <div className="flex flex-wrap gap-1.5">
                  {(
                    [
                      ["immediate", "As matches appear"],
                      ["daily", "Daily"],
                      ["weekly", "Weekly"],
                    ] as const
                  ).map(([value, label]) => (
                    <ChannelChip
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
              <label className="flex flex-col gap-1 max-w-[10rem]">
                <span className="font-mono text-[10px] tracking-[0.16em] uppercase text-charcoal/50">
                  Time (ET)
                </span>
                <input
                  type="time"
                  value={dailyTime}
                  onChange={(e) => setDailyTime(e.target.value)}
                  className="rounded-md border border-charcoal/15 px-2.5 py-1.5 text-xs text-navy focus:border-navy focus:outline-none bg-white"
                />
              </label>
            ) : null}

            {cadence === "weekly" ? (
              <div className="flex flex-wrap gap-2">
                <label className="flex flex-col gap-1 min-w-[7rem] flex-1">
                  <span className="font-mono text-[10px] tracking-[0.16em] uppercase text-charcoal/50">
                    Day
                  </span>
                  <select
                    value={weeklyDay}
                    onChange={(e) => setWeeklyDay(Number(e.target.value))}
                    className="rounded-md border border-charcoal/15 px-2.5 py-1.5 text-xs text-navy focus:border-navy focus:outline-none bg-white"
                  >
                    {WEEKDAYS.map((d) => (
                      <option key={d.value} value={d.value}>
                        {d.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1 max-w-[8rem]">
                  <span className="font-mono text-[10px] tracking-[0.16em] uppercase text-charcoal/50">
                    Time (ET)
                  </span>
                  <input
                    type="time"
                    value={weeklyTime}
                    onChange={(e) => setWeeklyTime(e.target.value)}
                    className="rounded-md border border-charcoal/15 px-2.5 py-1.5 text-xs text-navy focus:border-navy focus:outline-none bg-white"
                  />
                </label>
              </div>
            ) : null}

            {channel === "email" ? (
              <label className="flex flex-col gap-1">
                <span className="font-mono text-[10px] tracking-[0.16em] uppercase text-charcoal/50">
                  Email
                </span>
                <input
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="rounded-md border border-charcoal/15 px-2.5 py-1.5 text-xs text-navy focus:border-navy focus:outline-none bg-white"
                />
              </label>
            ) : (
              <label className="flex flex-col gap-1">
                <span className="font-mono text-[10px] tracking-[0.16em] uppercase text-charcoal/50">
                  Mobile (later)
                </span>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="(203) 555-0100"
                  disabled
                  className="rounded-md border border-charcoal/15 px-2.5 py-1.5 text-xs text-navy/40 bg-white/60 cursor-not-allowed"
                />
              </label>
            )}

            <div className="flex flex-wrap items-center gap-2 pt-0.5">
              <button
                type="button"
                onClick={() => void submit()}
                disabled={saving || searches.length === 0 || channel === "sms"}
                className="font-mono text-[10px] tracking-[0.12em] uppercase rounded-md px-3 py-1.5 border border-navy/30 text-navy bg-white hover:border-navy disabled:opacity-40 disabled:pointer-events-none transition-colors"
              >
                {saving ? "Saving…" : "Save alert"}
              </button>
              {message ? (
                <p className="text-[11px] text-sage leading-snug">{message}</p>
              ) : null}
              {error ? (
                <p className="text-[11px] text-coral leading-snug">{error}</p>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ChannelChip({
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
      className={`font-mono text-[10px] tracking-[0.12em] uppercase rounded-md px-2 py-1 border transition-colors ${
        active
          ? "border-navy bg-navy text-white"
          : muted
            ? "border-charcoal/15 text-charcoal/40 hover:border-charcoal/25"
            : "border-charcoal/20 text-navy/80 hover:border-navy/40 bg-white"
      }`}
    >
      {label}
      {muted ? " · soon" : ""}
    </button>
  );
}
