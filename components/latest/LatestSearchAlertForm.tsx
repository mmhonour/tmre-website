"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import IntelTownStatsDrawer from "@/components/intelligence/IntelTownStatsDrawer";
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
  "shrink-0 bg-transparent p-0 m-0 border-0 cursor-pointer font-mono text-[11px] tracking-[0.12em] uppercase text-navy hover:text-gold transition-colors";

/**
 * Underline rides the trigger words, not the whole button: a parent's
 * text-decoration paints through its children, so the hint after the hyphen
 * could not opt out of it from here.
 */
const LINK_BTN_LABEL =
  "underline decoration-navy/25 underline-offset-2 group-hover:decoration-gold/50";

/**
 * Create a listing alert from unique searches stored in the visitor's filter
 * cookies / search-history cookie. Email works now; SMS is disabled pending
 * Twilio + A2P (see search-alerts whiteboard).
 *
 * Desktop: compact dropdown under the trigger.
 * Mobile: right slide-over (opens from the right, content expands left).
 */
export default function LatestSearchAlertForm() {
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  // Drawer only on narrow viewports so desktop dropdown doesn't lock body scroll.
  const [isNarrow, setIsNarrow] = useState(() =>
    typeof window !== "undefined"
      ? window.matchMedia("(max-width: 1023px)").matches
      : false,
  );
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

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 1023px)");
    const sync = () => setIsNarrow(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
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
    // Desktop dropdown only — mobile drawer has its own backdrop / Escape.
    const onPointer = (e: MouseEvent) => {
      if (!window.matchMedia("(min-width: 1024px)").matches) return;
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && window.matchMedia("(min-width: 1024px)").matches) {
        setOpen(false);
      }
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

  const formProps = {
    searches,
    fingerprint,
    onFingerprintChange: setFingerprint,
    channel,
    onChannelChange: setChannel,
    cadence,
    onCadenceChange: setCadence,
    dailyTime,
    onDailyTimeChange: setDailyTime,
    weeklyDay,
    onWeeklyDayChange: setWeeklyDay,
    weeklyTime,
    onWeeklyTimeChange: setWeeklyTime,
    email,
    onEmailChange: setEmail,
    phone,
    onPhoneChange: setPhone,
    saving,
    message,
    error,
    onSubmit: () => void submit(),
  } as const;

  return (
    <div id="latest-alerts" ref={rootRef} className="relative inline-flex">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls="latest-alerts-panel"
        className={`${LINK_BTN} group inline-flex items-center gap-1.5`}
      >
        <svg
          viewBox="0 0 12 12"
          className="h-2.5 w-2.5 shrink-0 lg:hidden"
          fill="currentColor"
          aria-hidden
        >
          <path d="M8.5 1.2 L2.8 6 L8.5 10.8 Z" />
        </svg>
        <span className={LINK_BTN_LABEL}>
          Listing alerts{open ? " · close" : ""}
        </span>
        {/* The open panel says what it wants; the nudge would only crowd it. */}
        {open ? null : (
          <>
            <span aria-hidden>-</span>
            <span className="normal-case italic text-navy/55">
              choose from a previous search
            </span>
          </>
        )}
      </button>

      {/* Desktop: inlaid dropdown */}
      {open && !isNarrow ? (
        <div
          id="latest-alerts-panel"
          role="dialog"
          aria-label="Listing alerts"
          className="absolute left-0 top-full z-30 mt-2 w-[min(22rem,calc(100vw-2.5rem))] rounded-xl border border-charcoal/15 bg-cream shadow-[0_12px_32px_rgba(28,42,58,0.18)]"
        >
          <div className="space-y-3 px-3.5 py-3">
            <AlertFormFields {...formProps} />
          </div>
        </div>
      ) : null}

      {/* Mobile: right slide-over (slides in from the right) */}
      <IntelTownStatsDrawer
        open={open && isNarrow}
        onClose={() => setOpen(false)}
        title="Listing alerts"
        ariaLabel="Listing alerts"
      >
        <AlertFormFields {...formProps} />
      </IntelTownStatsDrawer>
    </div>
  );
}

function AlertFormFields({
  searches,
  fingerprint,
  onFingerprintChange,
  channel,
  onChannelChange,
  cadence,
  onCadenceChange,
  dailyTime,
  onDailyTimeChange,
  weeklyDay,
  onWeeklyDayChange,
  weeklyTime,
  onWeeklyTimeChange,
  email,
  onEmailChange,
  phone,
  onPhoneChange,
  saving,
  message,
  error,
  onSubmit,
}: {
  searches: VisitorSearchProfileEntry[];
  fingerprint: string;
  onFingerprintChange: (v: string) => void;
  channel: Channel;
  onChannelChange: (v: Channel) => void;
  cadence: Cadence;
  onCadenceChange: (v: Cadence) => void;
  dailyTime: string;
  onDailyTimeChange: (v: string) => void;
  weeklyDay: number;
  onWeeklyDayChange: (v: number) => void;
  weeklyTime: string;
  onWeeklyTimeChange: (v: string) => void;
  email: string;
  onEmailChange: (v: string) => void;
  phone: string;
  onPhoneChange: (v: string) => void;
  saving: boolean;
  message: string | null;
  error: string | null;
  onSubmit: () => void;
}) {
  return (
    <>
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
            onChange={(e) => onFingerprintChange(e.target.value)}
            className="w-full rounded-md border border-charcoal/15 bg-white px-2.5 py-1.5 text-xs text-navy focus:border-navy focus:outline-none"
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
              onClick={() => onChannelChange("email")}
              label="Email"
            />
            <ChannelChip
              active={channel === "sms"}
              onClick={() => onChannelChange("sms")}
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
                onClick={() => onCadenceChange(value)}
                label={label}
              />
            ))}
          </div>
        </fieldset>
      </div>

      {cadence === "daily" ? (
        <label className="flex max-w-[10rem] flex-col gap-1">
          <span className="font-mono text-[10px] tracking-[0.16em] uppercase text-charcoal/50">
            Time (ET)
          </span>
          <input
            type="time"
            value={dailyTime}
            onChange={(e) => onDailyTimeChange(e.target.value)}
            className="rounded-md border border-charcoal/15 bg-white px-2.5 py-1.5 text-xs text-navy focus:border-navy focus:outline-none"
          />
        </label>
      ) : null}

      {cadence === "weekly" ? (
        <div className="flex flex-wrap gap-2">
          <label className="flex min-w-[7rem] flex-1 flex-col gap-1">
            <span className="font-mono text-[10px] tracking-[0.16em] uppercase text-charcoal/50">
              Day
            </span>
            <select
              value={weeklyDay}
              onChange={(e) => onWeeklyDayChange(Number(e.target.value))}
              className="rounded-md border border-charcoal/15 bg-white px-2.5 py-1.5 text-xs text-navy focus:border-navy focus:outline-none"
            >
              {WEEKDAYS.map((d) => (
                <option key={d.value} value={d.value}>
                  {d.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex max-w-[8rem] flex-col gap-1">
            <span className="font-mono text-[10px] tracking-[0.16em] uppercase text-charcoal/50">
              Time (ET)
            </span>
            <input
              type="time"
              value={weeklyTime}
              onChange={(e) => onWeeklyTimeChange(e.target.value)}
              className="rounded-md border border-charcoal/15 bg-white px-2.5 py-1.5 text-xs text-navy focus:border-navy focus:outline-none"
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
            onChange={(e) => onEmailChange(e.target.value)}
            placeholder="you@example.com"
            className="rounded-md border border-charcoal/15 bg-white px-2.5 py-1.5 text-xs text-navy focus:border-navy focus:outline-none"
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
            onChange={(e) => onPhoneChange(e.target.value)}
            placeholder="(203) 555-0100"
            disabled
            className="cursor-not-allowed rounded-md border border-charcoal/15 bg-white/60 px-2.5 py-1.5 text-xs text-navy/40"
          />
        </label>
      )}

      <div className="flex flex-wrap items-center gap-2 pt-0.5">
        <button
          type="button"
          onClick={onSubmit}
          disabled={saving || searches.length === 0 || channel === "sms"}
          className="rounded-md border border-navy/30 bg-white px-3 py-1.5 font-mono text-[10px] tracking-[0.12em] uppercase text-navy transition-colors hover:border-navy disabled:pointer-events-none disabled:opacity-40"
        >
          {saving ? "Saving…" : "Save alert"}
        </button>
        {message ? (
          <p className="text-[11px] leading-snug text-sage">{message}</p>
        ) : null}
        {error ? (
          <p className="text-[11px] leading-snug text-coral">{error}</p>
        ) : null}
      </div>
    </>
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
      className={`rounded-md border px-2 py-1 font-mono text-[10px] tracking-[0.12em] uppercase transition-colors ${
        active
          ? "border-navy bg-navy text-white"
          : muted
            ? "border-charcoal/15 text-charcoal/40 hover:border-charcoal/25"
            : "border-charcoal/20 bg-white text-navy/80 hover:border-navy/40"
      }`}
    >
      {label}
      {muted ? " · soon" : ""}
    </button>
  );
}
