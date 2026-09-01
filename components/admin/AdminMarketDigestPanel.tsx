"use client";

import { useCallback, useEffect, useState } from "react";
import {
  TMRE_SYNC_SCHEDULE_CHANGED,
  dispatchSyncScheduleChanged,
} from "@/lib/admin-schedule-events";
import {
  DEFAULT_MARKET_DIGEST_SUBJECT_TEMPLATE,
  alignSubjectTemplateToWeekday,
  defaultMarketDigestSubjectTemplate,
  type MarketDigestConfig,
} from "@/lib/market-digest-shared";
import { adminSectionHref, adminSyncsHref } from "@/lib/admin-nav";
import {
  SYNC_SCHEDULE_WEEKDAYS,
  frequencyLabel,
  resolveJobBudgetMinutes,
  syncJobHostLabel,
  weekdayEtLabel,
  type SyncScheduleConfig,
  type SyncScheduleWeekdayEt,
} from "@/lib/sync-schedule-config-shared";

type PanelMessage = { text: string; tone: "ok" | "error" };

/** Read-only mirror of the shared market-digest row on Syncs → Configure. */
type DigestJobFacts = {
  frequency: string;
  runsOn: string;
  budgetMinutes: number;
  nextRunAt: string | null;
};

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
  const base = alignSubjectTemplateToWeekday(
    template.trim() || defaultMarketDigestSubjectTemplate(weekdayEt),
    weekdayEt,
  );
  return base.replaceAll("{date}", sample);
}

async function setMarketDigestJobPaused(paused: boolean): Promise<boolean> {
  try {
    const res = await fetch("/api/admin/scheduled-sync", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jobId: "market-digest", paused }),
    });
    if (!res.ok) return false;
    const body = (await res.json()) as {
      jobs?: { "market-digest"?: boolean };
    };
    return body.jobs?.["market-digest"] === paused;
  } catch {
    return false;
  }
}

/**
 * Weekly market brief content + schedule (day/time shared with Sync Dashboard
 * via Postgres sync_schedule_config). Enabled is tied to the Syncs Pause flag
 * for market-digest — a paused job cannot be scheduled from here.
 */
export default function AdminMarketDigestPanel({
  initial,
  initialJobPaused = false,
}: {
  initial?: MarketDigestConfig;
  /** Syncs → Dashboard Pause for market-digest. */
  initialJobPaused?: boolean;
}) {
  const [config, setConfig] = useState<MarketDigestConfig | null>(
    initial ?? null,
  );
  const [email, setEmail] = useState(initial?.email ?? "");
  const [enabled, setEnabled] = useState(initial?.enabled ?? true);
  const [jobPaused, setJobPaused] = useState(initialJobPaused);
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
  const [pauseSaving, setPauseSaving] = useState(false);
  const [message, setMessage] = useState<PanelMessage | null>(null);
  const [jobFacts, setJobFacts] = useState<DigestJobFacts | null>(null);

  const notify = useCallback((text: string) => {
    setMessage({ text, tone: "ok" });
  }, []);
  const fail = useCallback((text: string) => {
    setMessage({ text, tone: "error" });
  }, []);

  const applyConfig = useCallback((body: MarketDigestConfig) => {
    setConfig(body);
    setEmail(body.email);
    setEnabled(body.enabled);
    setSubjectTemplate(body.subjectTemplate);
    setIncludeSocialProfiles(body.includeSocialProfiles);
    setWeekdayEt(body.weekdayEt);
    setStartTimeEt(body.startTimeEt);
  }, []);

  const refreshPauseState = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/scheduled-sync", {
        cache: "no-store",
      });
      if (!res.ok) return;
      const body = (await res.json()) as {
        jobs?: { "market-digest"?: boolean };
      };
      if (typeof body.jobs?.["market-digest"] === "boolean") {
        setJobPaused(body.jobs["market-digest"]);
      }
    } catch {
      /* ignore */
    }
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

  /** Frequency / budget / Next are owned by Syncs → Configure — mirror them. */
  const refreshJobFacts = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/sync-schedule", {
        cache: "no-store",
      });
      if (!res.ok) return;
      const body = (await res.json()) as {
        scheduleConfig?: SyncScheduleConfig;
        nextRuns?: Record<string, string | null>;
      };
      const job = body.scheduleConfig?.jobs["market-digest"];
      if (!job) return;
      setJobFacts({
        frequency: frequencyLabel(job.frequency),
        runsOn: syncJobHostLabel("market-digest"),
        budgetMinutes: resolveJobBudgetMinutes("market-digest", job),
        nextRunAt: body.nextRuns?.["market-digest"] ?? null,
      });
    } catch {
      /* ignore */
    }
  }, []);

  // Always re-read on mount, even with a server `initial`: the App Router can
  // serve a cached RSC payload after a client navigation, which showed the
  // pre-edit day/time/subject while Postgres already had the new values.
  useEffect(() => {
    void refreshFromServer();
  }, [refreshFromServer]);

  useEffect(() => {
    void refreshPauseState();
    void refreshJobFacts();
  }, [refreshPauseState, refreshJobFacts]);

  useEffect(() => {
    const onScheduleChanged = (ev: Event) => {
      const detail = (ev as CustomEvent<{ source?: string }>).detail;
      void refreshPauseState();
      // Next run shifts after our own save too, so this is not source-gated.
      void refreshJobFacts();
      if (detail?.source === "market-digest") return;
      void refreshFromServer();
    };
    window.addEventListener(TMRE_SYNC_SCHEDULE_CHANGED, onScheduleChanged);
    return () => {
      window.removeEventListener(TMRE_SYNC_SCHEDULE_CHANGED, onScheduleChanged);
    };
  }, [refreshFromServer, refreshPauseState, refreshJobFacts]);

  const dirty =
    config != null &&
    (config.email !== email.trim() ||
      config.enabled !== enabled ||
      config.subjectTemplate !== subjectTemplate.trim() ||
      config.includeSocialProfiles !== includeSocialProfiles ||
      config.weekdayEt !== weekdayEt ||
      config.startTimeEt !== startTimeEt);

  /** Schedule controls require the Syncs job to be unpaused. */
  const scheduleLocked = jobPaused;

  const save = async () => {
    const trimmed = email.trim();
    if (!isValidEmail(trimmed)) {
      fail("Enter a valid email address");
      return;
    }
    // While the Syncs job is paused, schedule stays off — email/subject can still save.
    const wasJobPaused = jobPaused;
    const nextEnabled = wasJobPaused ? false : enabled;
    setSaving(true);
    setMessage(null);
    try {
      // Keep Syncs Pause aligned with Enabled (paused ⇔ !enabled).
      const pauseOk = await setMarketDigestJobPaused(!nextEnabled);
      if (!pauseOk) {
        fail("Could not update the Syncs market-digest pause flag");
        return;
      }
      setJobPaused(!nextEnabled);
      setEnabled(nextEnabled);

      const res = await fetch("/api/admin/market-digest", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: trimmed,
          enabled: nextEnabled,
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
        fail(body.error ?? "Save failed");
        return;
      }
      applyConfig(body);
      dispatchSyncScheduleChanged("market-digest");
      const day = weekdayEtLabel(body.weekdayEt);
      if (wasJobPaused && !body.enabled) {
        notify(
          `Saved content — schedule still locked until Syncs market-digest is unpaused`,
        );
      } else {
        notify(
          body.enabled
            ? `Saved — ${day} brief goes to ${body.email} at ${body.startTimeEt} ET (Syncs job running)`
            : `Saved — ${day} brief off (Syncs market-digest job paused)`,
        );
      }
    } catch (err) {
      fail(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const onEnabledChange = async (next: boolean) => {
    if (next && jobPaused) {
      // Turning on: unpause Syncs job so the schedule can fire.
      setPauseSaving(true);
      setMessage(null);
      const ok = await setMarketDigestJobPaused(false);
      setPauseSaving(false);
      if (!ok) {
        fail(
          "Could not unpause the Syncs market-digest job — open Syncs → Dashboard and clear Pause there.",
        );
        return;
      }
      setJobPaused(false);
      setEnabled(true);
      dispatchSyncScheduleChanged("market-digest");
      notify(
        "Syncs market-digest job unpaused — save to keep the brief enabled.",
      );
      return;
    }
    setEnabled(next);
  };

  const sendTest = async () => {
    setSending(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/market-digest", { method: "POST" });
      const raw = await res.text();
      let body: {
        ok?: boolean;
        error?: string;
        to?: string;
        subject?: string;
        reason?: string;
        queued?: boolean;
        message?: string;
      } & Partial<MarketDigestConfig>;
      try {
        body = JSON.parse(raw);
      } catch {
        // Netlify returns an HTML error page when the function is killed.
        fail(
          `Send failed — server returned HTTP ${res.status} instead of JSON. Try Syncs → Dashboard → market-digest → Run.`,
        );
        return;
      }
      if (!res.ok || !body.ok) {
        fail(body.error ?? body.reason ?? `Send failed (HTTP ${res.status})`);
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
      notify(
        body.message ??
          `Test sent to ${body.to ?? email}${body.subject ? ` — ${body.subject}` : ""}`,
      );
    } catch (err) {
      fail(err instanceof Error ? err.message : "Send failed");
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
          ). <strong className="font-medium text-navy">Enabled</strong> is the
          same switch as Pause on Syncs for the{" "}
          <span className="font-mono text-[11px]">market-digest</span> job — a
          paused job will not send. Send test now hands off to the same
          background worker as the cron (the brief is too slow for a
          request-time send) and does not count as the scheduled send, so the
          next scheduled brief still goes out — watch
          Syncs → History for the{" "}
          <span className="font-mono text-[11px]">digest</span> row. Requires{" "}
          <span className="font-mono text-[11px]">RESEND_API_KEY</span>.
        </p>
      </div>
      <div className="px-5 sm:px-6 py-4 space-y-4">
        {scheduleLocked ? (
          <div
            role="status"
            className="rounded-lg border border-coral/30 bg-coral/[0.08] px-3 py-2.5 text-sm text-navy"
          >
            <p className="font-mono text-[10px] tracking-[0.14em] uppercase text-coral">
              Schedule locked — Syncs job paused
            </p>
            <p className="mt-1 text-xs leading-snug text-slate">
              The <span className="font-mono text-[11px]">market-digest</span>{" "}
              job is paused on{" "}
              <a
                href={adminSyncsHref("dashboard")}
                className="text-navy underline-offset-2 hover:underline"
              >
                Syncs → Dashboard
              </a>
              . The Netlify cron skips the brief while Pause is on, so you cannot
              arm day/time or turn Enabled on from here until that job is
              unpaused (or check Enabled below to unpause it, then Save).
            </p>
          </div>
        ) : null}

        {jobFacts ? (
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1 rounded-lg border border-charcoal/[0.08] bg-cream/30 px-3 py-2">
            <span className="font-mono text-[10px] tracking-[0.14em] uppercase text-charcoal/40">
              Shared sync job
            </span>
            <span className="font-mono text-[10px] text-charcoal/60">
              <span className="text-charcoal/35 uppercase tracking-wide mr-1">
                Frequency
              </span>
              {jobFacts.frequency}
            </span>
            <span className="font-mono text-[10px] text-charcoal/60">
              <span className="text-charcoal/35 uppercase tracking-wide mr-1">
                Runs on
              </span>
              {jobFacts.runsOn}
            </span>
            <span className="font-mono text-[10px] text-charcoal/60">
              <span className="text-charcoal/35 uppercase tracking-wide mr-1">
                Budget
              </span>
              {jobFacts.budgetMinutes}m
            </span>
            <span className="font-mono text-[10px] text-charcoal/60">
              <span className="text-charcoal/35 uppercase tracking-wide mr-1">
                Next
              </span>
              {jobPaused
                ? "paused"
                : jobFacts.nextRunAt
                  ? new Date(jobFacts.nextRunAt).toLocaleString()
                  : "—"}
            </span>
            <a
              href={adminSyncsHref("configure")}
              className="font-mono text-[10px] text-navy underline-offset-2 hover:underline"
            >
              Edit on Syncs → Configure
            </a>
          </div>
        ) : null}

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
              disabled={scheduleLocked}
              className="w-40 max-w-full rounded-lg border border-charcoal/15 px-3 py-2 font-mono text-sm text-navy focus:border-navy focus:outline-none disabled:cursor-not-allowed disabled:opacity-45"
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
              disabled={scheduleLocked}
              className="w-36 max-w-full rounded-lg border border-charcoal/15 px-3 py-2 font-mono text-sm tabular-nums text-navy focus:border-navy focus:outline-none disabled:cursor-not-allowed disabled:opacity-45"
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
          <label
            className={`inline-flex items-center gap-2 pb-2 select-none ${
              pauseSaving ? "opacity-50" : "cursor-pointer"
            }`}
          >
            <input
              type="checkbox"
              checked={enabled && !jobPaused}
              disabled={pauseSaving}
              onChange={(e) => void onEnabledChange(e.target.checked)}
              className="rounded border-charcoal/30"
            />
            <span className="font-mono text-[10px] tracking-[0.12em] uppercase text-charcoal/70">
              Enabled
              {jobPaused ? " (job paused)" : ""}
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
            Use {"{date}"} for the Eastern long date of the send day (same
            weekday as the pick list). Changing send day updates the day name
            in the subject. Preview:{" "}
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
            {jobPaused
              ? "Not scheduled — Syncs market-digest job is paused · "
              : config.enabled
                ? `Scheduled ${weekdayEtLabel(config.weekdayEt)}s at ${config.startTimeEt} ET · `
                : `Saved schedule ${weekdayEtLabel(config.weekdayEt)}s ${config.startTimeEt} ET but Enabled is off · `}
            last sent{" "}
            {config.lastSentAt
              ? new Date(config.lastSentAt).toLocaleString()
              : "never"}
          </p>
        ) : null}
        {message ? (
          <p
            role="status"
            aria-live="polite"
            className={
              message.tone === "error"
                ? "rounded-lg border border-coral/40 bg-coral/[0.08] px-3 py-2 text-xs leading-snug text-navy"
                : "rounded-lg border border-sage/40 bg-sage/[0.08] px-3 py-2 text-xs leading-snug text-navy"
            }
          >
            {message.text}
          </p>
        ) : null}
      </div>
    </div>
  );
}
