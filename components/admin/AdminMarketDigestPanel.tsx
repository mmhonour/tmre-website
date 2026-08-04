"use client";

import { useCallback, useEffect, useState } from "react";
import {
  TMRE_SYNC_SCHEDULE_CHANGED,
  dispatchSyncScheduleChanged,
} from "@/lib/admin-schedule-events";
import {
  DEFAULT_MARKET_DIGEST_SUBJECT_TEMPLATE,
  defaultMarketDigestSubjectTemplate,
  type MarketDigestConfig,
} from "@/lib/market-digest-shared";
import { adminSectionHref } from "@/lib/admin-nav";
import {
  SYNC_SCHEDULE_WEEKDAYS,
  weekdayEtLabel,
  type SyncScheduleWeekdayEt,
} from "@/lib/sync-schedule-config-shared";

function isValidEmail(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 254) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed);
}

function sampleDateForWeekday(weekdayEt: SyncScheduleWeekdayEt): string {
  // Fixed sample week (Sun Aug 2 – Sat Aug 8 2026) so preview day matches selection.
  const day = 2 + weekdayEt;
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(2026, 7, day)));
}

function previewSubject(
  template: string,
  weekdayEt: SyncScheduleWeekdayEt,
): string {
  const sample = sampleDateForWeekday(weekdayEt);
  const base =
    template.trim() || defaultMarketDigestSubjectTemplate(weekdayEt);
  return base.replaceAll("{date}", sample);
}

/**
 * Weekly market brief content + schedule (day/time shared with Sync Dashboard
 * via Postgres sync_schedule_config).
 */
export default function AdminMarketDigestPanel({
  initial,
}: {
  initial?: MarketDigestConfig;
}) {
  const [config, setConfig] = useState<MarketDigestConfig | null>(
    initial ?? null,
  );
  const [email, setEmail] = useState(initial?.email ?? "");
  const [enabled, setEnabled] = useState(initial?.enabled ?? true);
  const [subjectTemplate, setSubjectTemplate] = useState(
    initial?.subjectTemplate ?? DEFAULT_MARKET_DIGEST_SUBJECT_TEMPLATE,
  );
  const [includeSocialProfiles, setIncludeSocialProfiles] = useState(
    initial?.includeSocialProfiles ?? false,
  );
  const [weekdayEt, setWeekdayEt] = useState<SyncScheduleWeekdayEt>(
    initial?.weekdayEt ?? 1,
  );
  const [startTimeEt, setStartTimeEt] = useState(
    initial?.startTimeEt ?? "08:00",
  );
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const applyConfig = useCallback((body: MarketDigestConfig) => {
    setConfig(body);
    setEmail(body.email);
    setEnabled(body.enabled);
    setSubjectTemplate(body.subjectTemplate);
    setIncludeSocialProfiles(body.includeSocialProfiles);
    setWeekdayEt(body.weekdayEt);
    setStartTimeEt(body.startTimeEt);
  }, []);

  const refreshFromServer = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/market-digest", { cache: "no-store" });
      if (!res.ok) return;
      const body = (await res.json()) as MarketDigestConfig;
      applyConfig(body);
    } catch {
      /* ignore */
    }
  }, [applyConfig]);

  useEffect(() => {
    if (initial) return;
    void refreshFromServer();
  }, [initial, refreshFromServer]);

  useEffect(() => {
    const onScheduleChanged = (ev: Event) => {
      const detail = (ev as CustomEvent<{ source?: string }>).detail;
      if (detail?.source === "market-digest") return;
      void refreshFromServer();
    };
    window.addEventListener(TMRE_SYNC_SCHEDULE_CHANGED, onScheduleChanged);
    return () => {
      window.removeEventListener(TMRE_SYNC_SCHEDULE_CHANGED, onScheduleChanged);
    };
  }, [refreshFromServer]);

  const dirty =
    config != null &&
    (config.email !== email.trim() ||
      config.enabled !== enabled ||
      config.subjectTemplate !== subjectTemplate.trim() ||
      config.includeSocialProfiles !== includeSocialProfiles ||
      config.weekdayEt !== weekdayEt ||
      config.startTimeEt !== startTimeEt);

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
          weekdayEt,
          startTimeEt,
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
      applyConfig(body);
      dispatchSyncScheduleChanged("market-digest");
      const day = weekdayEtLabel(body.weekdayEt);
      setMessage(
        body.enabled
          ? `Saved — ${day} brief goes to ${body.email} at ${body.startTimeEt} ET`
          : `Saved — ${day} brief paused`,
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
                weekdayEt: body.weekdayEt ?? prev.weekdayEt,
                startTimeEt: body.startTimeEt ?? prev.startTimeEt,
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

  const onWeekdayChange = (next: SyncScheduleWeekdayEt) => {
    setWeekdayEt(next);
    setSubjectTemplate((prev) => {
      const from = weekdayEt;
      const fromDefault = defaultMarketDigestSubjectTemplate(from);
      const toDefault = defaultMarketDigestSubjectTemplate(next);
      const trimmed = prev.trim();
      if (
        !trimmed ||
        trimmed === fromDefault ||
        trimmed === DEFAULT_MARKET_DIGEST_SUBJECT_TEMPLATE
      ) {
        return toDefault;
      }
      const re =
        /^(Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday)(\s+market brief\b)/i;
      if (re.test(trimmed)) {
        return trimmed.replace(re, `${weekdayEtLabel(next)}$2`);
      }
      return prev;
    });
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
          Weekly HTML brief (inventory / months-supply bars, DOTW card). Day and
          start time are shared with{" "}
          <a
            href={adminSectionHref("admin-sync", "syncs")}
            className="text-navy underline-offset-2 hover:underline"
          >
            Syncs → Configure
          </a>{" "}
          (Postgres <span className="font-mono text-[11px]">sync_schedule_config</span>
          ). Pause / Run also live on Syncs. Send test now does not advance the
          weekly watermark. Requires{" "}
          <span className="font-mono text-[11px]">RESEND_API_KEY</span>.
        </p>
      </div>
      <div className="px-5 sm:px-6 py-4 space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1">
            <span className="font-mono text-[10px] tracking-[0.16em] uppercase text-charcoal/50">
              Send day (ET)
            </span>
            <select
              value={weekdayEt}
              onChange={(e) =>
                onWeekdayChange(Number(e.target.value) as SyncScheduleWeekdayEt)
              }
              className="w-40 max-w-full rounded-lg border border-charcoal/15 px-3 py-2 font-mono text-sm text-navy focus:border-navy focus:outline-none"
              aria-label="Weekly send day Eastern"
            >
              {SYNC_SCHEDULE_WEEKDAYS.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="font-mono text-[10px] tracking-[0.16em] uppercase text-charcoal/50">
              Start time (ET)
            </span>
            <input
              type="time"
              value={startTimeEt}
              onChange={(e) => setStartTimeEt(e.target.value)}
              className="w-36 max-w-full rounded-lg border border-charcoal/15 px-3 py-2 font-mono text-sm tabular-nums text-navy focus:border-navy focus:outline-none"
              aria-label="Weekly start time Eastern"
            />
          </label>
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
            placeholder={defaultMarketDigestSubjectTemplate(weekdayEt)}
            className="w-full rounded-lg border border-charcoal/15 px-3 py-2 font-mono text-sm text-navy focus:border-navy focus:outline-none"
          />
          <span className="font-mono text-[10px] text-charcoal/40">
            Use {"{date}"} for the Eastern long date. Changing send day updates
            the day name in the default subject. Preview:{" "}
            <span className="text-charcoal/65">
              {previewSubject(subjectTemplate, weekdayEt)}
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
            Scheduled {weekdayEtLabel(config.weekdayEt)}s at {config.startTimeEt}{" "}
            ET · last sent{" "}
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
