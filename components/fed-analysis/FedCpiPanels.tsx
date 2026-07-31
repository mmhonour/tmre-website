import {
  CPI_SCHEDULE_URL,
  formatCpiPct,
  formatCpiReferenceMonth,
  getNextCpiRelease,
  getPrevailingCpi,
  type CpiRelease,
} from "@/lib/cpi-calendar";
import { formatFomcDayWithWeekday } from "@/lib/fed-fomc-calendar";

export default function FedCpiPanels({
  releases,
  now = new Date(),
}: {
  releases: readonly CpiRelease[];
  now?: Date;
}) {
  const prevailing = getPrevailingCpi(now, releases);
  const next = getNextCpiRelease(now, releases);

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="rounded-2xl border border-charcoal/[0.08] bg-white px-5 py-5 shadow-sm shadow-charcoal/[0.04] sm:px-6">
        <p className="font-mono text-[11px] tracking-[0.2em] uppercase text-gold">
          Prevailing CPI
        </p>
        {prevailing ? (
          <>
            <p className="mt-3 font-serif text-3xl text-navy sm:text-4xl">
              {prevailing.headline}
            </p>
            <p className="mt-2 text-sm text-slate">
              {prevailing.referenceLabel} CPI, released{" "}
              <span className="font-medium text-navy">
                {prevailing.releasedOnLabel}
              </span>
              .
              {prevailing.release.coreYoyPct != null
                ? ` Core ${formatCpiPct(prevailing.release.coreYoyPct)} YoY.`
                : ""}
            </p>
            {prevailing.release.note ? (
              <p className="mt-2 text-xs text-charcoal/50">
                {prevailing.release.note}
              </p>
            ) : null}
            {prevailing.release.releaseUrl ? (
              <a
                href={prevailing.release.releaseUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-3 inline-block font-mono text-[11px] tracking-[0.12em] uppercase text-navy underline decoration-navy/25 underline-offset-2 hover:decoration-navy"
              >
                BLS release
              </a>
            ) : null}
          </>
        ) : (
          <p className="mt-3 text-sm text-slate">
            No CPI print recorded in the local calendar yet.
          </p>
        )}
      </div>

      <div className="rounded-2xl border border-charcoal/[0.08] bg-white px-5 py-5 shadow-sm shadow-charcoal/[0.04] sm:px-6">
        <p className="font-mono text-[11px] tracking-[0.2em] uppercase text-gold">
          Next CPI
        </p>
        {next ? (
          <>
            <p className="mt-3 font-serif text-2xl text-navy sm:text-3xl">
              {formatFomcDayWithWeekday(next.releaseDate, { month: "long" })}
            </p>
            <p className="mt-2 text-sm text-slate">
              {formatCpiReferenceMonth(next.referenceMonth)} CPI ·{" "}
              {next.releaseTimeEt}.
              {cpiHasPrintPending(next)
                ? " Print not recorded yet."
                : ` ${formatCpiPct(next.yoyPct)} YoY · ${formatCpiPct(next.momPct)} MoM.`}
            </p>
            <a
              href={CPI_SCHEDULE_URL}
              target="_blank"
              rel="noreferrer"
              className="mt-3 inline-block font-mono text-[11px] tracking-[0.12em] uppercase text-navy underline decoration-navy/25 underline-offset-2 hover:decoration-navy"
            >
              BLS CPI schedule
            </a>
          </>
        ) : (
          <p className="mt-3 text-sm text-slate">
            Schedule needs the next year&rsquo;s dates — check{" "}
            <a
              href={CPI_SCHEDULE_URL}
              target="_blank"
              rel="noreferrer"
              className="text-navy underline underline-offset-2"
            >
              bls.gov
            </a>
            .
          </p>
        )}
      </div>
    </div>
  );
}

function cpiHasPrintPending(r: CpiRelease): boolean {
  return r.yoyPct == null && r.momPct == null;
}
