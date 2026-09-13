"use client";

import {
  alertJobKindLabel,
  alertJobSourceLabel,
  type AlertJobKind,
  type AlertJobLastRun,
  type AlertJobLastRuns,
} from "@/lib/saved-search-alert-kinds";

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
}: {
  kind: AlertJobKind;
  run: AlertJobLastRun | null;
}) {
  const stale =
    run?.at != null && Date.now() - new Date(run.at).getTime() > 3 * 60 * 60 * 1000;
  const tone =
    !run ? "text-charcoal/45" : run.ok === false || stale ? "text-coral" : "text-sage";
  const status = !run
    ? "No run recorded"
    : run.ok === false
      ? "Failed"
      : stale
        ? "Stale"
        : "Ran";

  return (
    <div className="rounded-xl border border-charcoal/[0.08] bg-white px-4 py-3">
      <p className="font-mono text-[10px] tracking-[0.16em] uppercase text-gold">
        {alertJobKindLabel(kind)}
      </p>
      <p className={`mt-1 font-mono text-[12px] ${tone}`}>{status}</p>
      <p className="mt-1 font-mono text-[11px] text-charcoal/60">
        {fmtWhen(run?.at)}
        {run ? ` · ${alertJobSourceLabel(run.source)}` : ""}
      </p>
      {run ? (
        <p className="mt-1 font-mono text-[10px] text-charcoal/45">
          checked {run.checked} · sent {run.sent} · homes {run.listings}
        </p>
      ) : (
        <p className="mt-1 font-mono text-[10px] text-charcoal/40">
          {kind === "listing"
            ? "Should stamp after Incremental RETS"
            : "Should stamp after the Open houses job"}
        </p>
      )}
      {run?.error ? (
        <p className="mt-1 text-[11px] text-coral break-words">{run.error}</p>
      ) : null}
    </div>
  );
}

/**
 * Two doorbell clocks — listing Incremental vs OH job. Not one shared
 * last_notified_at. Stale = last stamp older than 3 hours.
 */
export default function AdminAlertJobHealth({
  lastRuns,
}: {
  lastRuns: AlertJobLastRuns;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <JobCard kind="listing" run={lastRuns.listing} />
      <JobCard kind="open_house" run={lastRuns.openHouse} />
    </div>
  );
}
