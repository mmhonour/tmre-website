import FedStatementSummary from "@/components/fed-analysis/FedStatementSummary";
import {
  formatCpiPct,
  getPrevailingCpi,
  type CpiRelease,
} from "@/lib/cpi-calendar";
import {
  decisionLabel,
  formatFedFundsRange,
  formatFomcMeetingSpan,
  type FomcMeeting,
  type PrevailingFedPolicy,
} from "@/lib/fed-fomc-calendar";

const FOMC_CALENDAR_URL =
  "https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm";

/**
 * Top policy row: FOMC decision | Prevailing CPI
 * (Markets calendar and timeline live outside this card on the page.)
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

  return (
    <div className="overflow-hidden rounded-2xl border border-charcoal/[0.08] bg-white shadow-sm shadow-charcoal/[0.04]">
      <div className="grid lg:grid-cols-2 lg:divide-x lg:divide-charcoal/[0.08]">
        <div className="flex flex-col px-5 py-5 sm:px-6 lg:px-8">
          <p className="font-mono text-[11px] tracking-[0.2em] uppercase text-gold">
            FOMC decision
          </p>
          {prevailingFed ? (
            <>
              <p className="mt-3 font-serif text-2xl text-navy sm:text-3xl">
                {prevailingFed.decisionLabel}
              </p>
              <p className="mt-2 text-sm text-slate">
                {prevailingFed.decidedOnLabel}
                {" · "}
                <span className="font-medium text-navy">
                  {prevailingFed.targetLabel}
                </span>
              </p>
            </>
          ) : (
            <p className="mt-3 text-sm text-slate">
              No decided meetings in the local calendar yet.
            </p>
          )}

          {nextMeeting ? (
            <div className="mt-5 border-t border-charcoal/[0.08] pt-4">
              <p className="font-mono text-[10px] tracking-[0.16em] uppercase text-charcoal/45">
                Next FOMC
              </p>
              <p className="mt-1.5 font-serif text-xl text-navy">
                {formatFomcMeetingSpan(
                  nextMeeting.startDate,
                  nextMeeting.endDate,
                )}
              </p>
              <p className="mt-1.5 text-sm text-slate">
                {nextMeeting.decision == null
                  ? "Statement typically 2:00 p.m. ET on the decision day; Chair press conference ~2:30 p.m. ET."
                  : `${decisionLabel(nextMeeting.decision, nextMeeting.basisPoints)} · ${formatFedFundsRange(nextMeeting.targetRangeLow, nextMeeting.targetRangeHigh)}`}
                {nextMeeting.hasSep ? " Includes SEP projections." : ""}
              </p>
            </div>
          ) : (
            <p className="mt-4 text-sm text-slate">
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

          {prevailingFed ? (
            <FedStatementSummary meeting={prevailingFed.meeting} />
          ) : null}
        </div>

        <div className="flex flex-col border-t border-charcoal/[0.08] px-5 py-5 sm:px-6 lg:border-t-0 lg:px-8">
          <p className="font-mono text-[11px] tracking-[0.2em] uppercase text-gold">
            Prevailing CPI
          </p>
          {prevailingCpi ? (
            <>
              <p className="mt-3 font-serif text-3xl text-navy sm:text-4xl">
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
      </div>
    </div>
  );
}
