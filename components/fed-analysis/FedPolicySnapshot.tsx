import FedStatementSummary from "@/components/fed-analysis/FedStatementSummary";
import {
  CPI_SCHEDULE_URL,
  formatCpiPct,
  formatCpiReferenceMonth,
  getNextCpiRelease,
  getPrevailingCpi,
  type CpiRelease,
} from "@/lib/cpi-calendar";
import {
  decisionLabel,
  formatFedFundsRange,
  formatFomcDayWithWeekday,
  formatFomcMeetingSpan,
  type FomcMeeting,
  type PrevailingFedPolicy,
} from "@/lib/fed-fomc-calendar";

const FOMC_CALENDAR_URL =
  "https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm";

function cpiHasPrintPending(r: CpiRelease): boolean {
  return r.yoyPct == null && r.momPct == null;
}

/**
 * Single panel: Prevailing (Fed decision + CPI) | Next (FOMC + CPI).
 */
export default function FedPolicySnapshot({
  prevailingFed,
  nextMeeting,
  releases,
  now = new Date(),
}: {
  prevailingFed: PrevailingFedPolicy | null;
  nextMeeting: FomcMeeting | null;
  releases: readonly CpiRelease[];
  now?: Date;
}) {
  const prevailingCpi = getPrevailingCpi(now, releases);
  const nextCpi = getNextCpiRelease(now, releases);

  return (
    <div className="overflow-hidden rounded-2xl border border-charcoal/[0.08] bg-white shadow-sm shadow-charcoal/[0.04]">
      <div className="border-b border-charcoal/[0.08] bg-cream/30 px-5 py-5 sm:px-6 lg:px-8">
        <p className="font-mono text-[11px] tracking-[0.2em] uppercase text-gold">
          Fed Target Range
        </p>
        {prevailingFed ? (
          <>
            <p className="mt-2 font-serif text-4xl text-navy sm:text-5xl lg:text-6xl">
              {prevailingFed.targetLabel}
            </p>
            <p className="mt-2 text-sm text-slate">
              After{" "}
              <span className="font-medium text-navy">
                {prevailingFed.decisionLabel}
              </span>{" "}
              on {prevailingFed.decidedOnLabel}.
            </p>
          </>
        ) : (
          <p className="mt-2 text-sm text-slate">
            No decided meetings in the local calendar yet.
          </p>
        )}
      </div>

      <div className="grid lg:grid-cols-2 lg:divide-x lg:divide-charcoal/[0.08]">
        {/* —— Prevailing —— */}
        <div className="flex flex-col px-5 py-5 sm:px-6">
          <p className="font-mono text-[11px] tracking-[0.2em] uppercase text-gold">
            Prevailing
          </p>

          <div className="mt-4">
            <p className="font-mono text-[10px] tracking-[0.16em] uppercase text-charcoal/40">
              CPI
            </p>
            {prevailingCpi ? (
              <>
                <p className="mt-2 font-serif text-2xl text-navy sm:text-3xl">
                  {prevailingCpi.headline}
                </p>
                <p className="mt-2 text-sm text-slate">
                  {prevailingCpi.referenceLabel} CPI, released{" "}
                  <span className="font-medium text-navy">
                    {prevailingCpi.releasedOnLabel}
                  </span>
                  .
                  {prevailingCpi.release.coreYoyPct != null
                    ? ` Core ${formatCpiPct(prevailingCpi.release.coreYoyPct)} YoY.`
                    : ""}
                </p>
                {prevailingCpi.release.note ? (
                  <p className="mt-2 text-xs text-charcoal/50">
                    {prevailingCpi.release.note}
                  </p>
                ) : null}
                {prevailingCpi.release.releaseUrl ? (
                  <a
                    href={prevailingCpi.release.releaseUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-2 inline-block font-mono text-[11px] tracking-[0.12em] uppercase text-navy underline decoration-navy/25 underline-offset-2 hover:decoration-navy"
                  >
                    BLS release
                  </a>
                ) : null}
              </>
            ) : (
              <p className="mt-2 text-sm text-slate">
                No CPI print recorded in the local calendar yet.
              </p>
            )}
          </div>

          {prevailingFed ? (
            <FedStatementSummary meeting={prevailingFed.meeting} />
          ) : null}
        </div>

        {/* —— Next —— */}
        <div className="flex flex-col border-t border-charcoal/[0.08] px-5 py-5 sm:px-6 lg:border-t-0">
          <p className="font-mono text-[11px] tracking-[0.2em] uppercase text-gold">
            Next
          </p>

          <div className="mt-4">
            <p className="font-mono text-[10px] tracking-[0.16em] uppercase text-charcoal/40">
              FOMC
            </p>
            {nextMeeting ? (
              <>
                <p className="mt-2 font-serif text-2xl text-navy sm:text-3xl">
                  {formatFomcMeetingSpan(
                    nextMeeting.startDate,
                    nextMeeting.endDate,
                  )}
                </p>
                <p className="mt-2 text-sm text-slate">
                  {nextMeeting.decision == null
                    ? "Statement typically 2:00 p.m. ET on the decision day; Chair press conference ~2:30 p.m. ET."
                    : `${decisionLabel(nextMeeting.decision, nextMeeting.basisPoints)} · ${formatFedFundsRange(nextMeeting.targetRangeLow, nextMeeting.targetRangeHigh)}`}
                  {nextMeeting.hasSep ? " Includes SEP projections." : ""}
                </p>
              </>
            ) : (
              <p className="mt-2 text-sm text-slate">
                Calendar needs the next year&rsquo;s dates — check{" "}
                <a
                  href={FOMC_CALENDAR_URL}
                  target="_blank"
                  rel="noreferrer"
                  className="text-navy underline underline-offset-2"
                >
                  federalreserve.gov
                </a>
                .
              </p>
            )}
          </div>

          <div className="mt-5 border-t border-charcoal/[0.06] pt-4">
            <p className="font-mono text-[10px] tracking-[0.16em] uppercase text-charcoal/40">
              CPI
            </p>
            {nextCpi ? (
              <>
                <p className="mt-2 font-serif text-2xl text-navy sm:text-3xl">
                  {formatFomcDayWithWeekday(nextCpi.releaseDate, {
                    month: "long",
                  })}
                </p>
                <p className="mt-2 text-sm text-slate">
                  {formatCpiReferenceMonth(nextCpi.referenceMonth)} CPI ·{" "}
                  {nextCpi.releaseTimeEt}.
                  {cpiHasPrintPending(nextCpi)
                    ? " Print not recorded yet."
                    : ` ${formatCpiPct(nextCpi.yoyPct)} YoY · ${formatCpiPct(nextCpi.momPct)} MoM.`}
                </p>
                <a
                  href={CPI_SCHEDULE_URL}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-2 inline-block font-mono text-[11px] tracking-[0.12em] uppercase text-navy underline decoration-navy/25 underline-offset-2 hover:decoration-navy"
                >
                  BLS CPI schedule
                </a>
              </>
            ) : (
              <p className="mt-2 text-sm text-slate">
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
      </div>
    </div>
  );
}
