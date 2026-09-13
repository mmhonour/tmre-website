"use client";

import {
  alertJobKindLabel,
  alertJobSourceLabel,
  type AlertJobKind,
  type AlertJobLastRun,
  type AlertJobLastRuns,
} from "@/lib/saved-search-alert-kinds";

export type AlertDirtyStateClient = {
  listing: string | null;
  openHouse: string | null;
};

function fmtWhen(iso: string | null | undefined): string {
  if (!iso) return "never";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function JobCard({
  kind,
  run,
  dirtyAt,
}: {
  kind: AlertJobKind;
  run: AlertJobLastRun | null;
  dirtyAt: string | null;
}) {
  const dirty = Boolean(dirtyAt);
  const stale =
    run?.at != null && Date.now() - new Date(run.at).getTime() > 3 * 60 * 60 * 1000;
  const tone = dirty
    ? "text-gold"
    : !run
      ? "text-charcoal/45"
      : run.ok === false || stale
        ? "text-coral"
        : "text-sage";
  const status = dirty
    ? "Dirty — send now"
    : !run
      ? "Clean · no send yet"
      : run.ok === false
        ? "Failed"
        : stale
          ? "Stale"
          : "Clean · sent";

  return (
    <div className="rounded-xl border border-charcoal/[0.08] bg-white px-4 py-3">
      <p className="font-mono text-[10px] tracking-[0.16em] uppercase text-gold">
        {alertJobKindLabel(kind)}
      </p>
      <p className={`mt-1 font-mono text-[12px] ${tone}`}>{status}</p>
      <p className="mt-1 font-mono text-[11px] text-charcoal/60">
        Dirty {fmtWhen(dirtyAt)}
      </p>
      <p className="mt-1 font-mono text-[11px] text-charcoal/60">
        Last send {fmtWhen(run?.at)}
        {run ? ` · ${alertJobSourceLabel(run.source)}` : ""}
      </p>
      {run ? (
        <p className="mt-1 font-mono text-[10px] text-charcoal/45">
          checked {run.checked} · sent {run.sent} · homes {run.listings}
        </p>
      ) : (
        <p className="mt-1 font-mono text-[10px] text-charcoal/40">
          {kind === "listing"
            ? "Incremental marks dirty after RETS"
            : "Open houses job marks dirty after pull"}
        </p>
      )}
      {run?.error ? (
        <p className="mt-1 text-[11px] text-coral break-words">{run.error}</p>
      ) : null}
    </div>
  );
}

/**
 * Dirty = Incremental or OH finished a write and the Railway alerts job
 * has not cleared it. Last send is that job, not Lane 3.
 */
export default function AdminAlertJobHealth({
  lastRuns,
  dirty,
}: {
  lastRuns: AlertJobLastRuns;
  dirty?: AlertDirtyStateClient;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <JobCard
        kind="listing"
        run={lastRuns.listing}
        dirtyAt={dirty?.listing ?? null}
      />
      <JobCard
        kind="open_house"
        run={lastRuns.openHouse}
        dirtyAt={dirty?.openHouse ?? null}
      />
    </div>
  );
}
