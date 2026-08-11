import FedCpiSummary from "@/components/fed-analysis/FedCpiSummary";
import FedEventsCalendar from "@/components/fed-analysis/FedEventsCalendar";
import FedStatementSummary from "@/components/fed-analysis/FedStatementSummary";
import FedUpcomingDates from "@/components/fed-analysis/FedUpcomingDates";
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
 * Top policy row: FOMC decision | Prevailing CPI | Markets calendar sidebar,
 * with next-3-months dates under the FOMC / CPI columns.
 */
export default function FedPolicySnapshot({
  prevailingFed,
  nextMeeting,
  meetings,
  releases,
  now = new Date(),
}: {
  prevailingFed: PrevailingFedPolicy | null;
  nextMeeting: FomcMeeting | null;
  meetings: readonly FomcMeeting[];
  releases: readonly CpiRelease[];
  now?: Date;
}) {
  const prevailingCpi = getPrevailingCpi(now, releases);

  return (
    <div className="overflow-hidden rounded-2xl border border-charcoal/[0.08] bg-white shadow-sm shadow-charcoal/[0.04]">
      <div className="grid lg:grid-cols-[1fr_1fr_minmax(15rem,18rem)]">
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

        <div className="flex flex-col border-t border-charcoal/[0.08] px-5 py-5 sm:px-6 lg:border-t-0 lg:border-l lg:border-charcoal/[0.08] lg:px-8">
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
              {(prevailingCpi.release.highlights?.length ?? 0) > 0 ? (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {prevailingCpi.release.highlights!.slice(0, 4).map((h, i) => {
                    const tone =
                      h.direction === "up"
                        ? "border-coral/30 bg-coral/10 text-coral"
                        : h.direction === "down"
                          ? "border-sage/30 bg-sage/10 text-sage"
                          : "border-charcoal/15 bg-cream/60 text-charcoal/55";
                    return (
                      <span
                        key={`${h.label}-${i}`}
                        className={`inline-flex max-w-[12rem] truncate rounded-full border px-2 py-0.5 font-mono text-[9px] tracking-[0.08em] uppercase ${tone}`}
                        title={h.label}
                      >
                        {h.label}
                      </span>
                    );
                  })}
                </div>
              ) : null}
              <FedCpiSummary release={prevailingCpi.release} />
            </>
          ) : (
            <p className="mt-3 text-sm text-slate">
              No CPI print recorded in the local calendar yet.
            </p>
          )}
        </div>

        <div className="border-t border-charcoal/[0.08] lg:row-span-2 lg:border-t-0 lg:border-l lg:border-charcoal/[0.08]">
          <FedEventsCalendar
            meetings={meetings}
            cpiReleases={releases}
            initialYear={now.getFullYear()}
            initialMonth={now.getMonth()}
          />
        </div>

        <div className="lg:col-span-2">
          <FedUpcomingDates
            meetings={meetings}
            releases={releases}
            now={now}
            months={3}
          />
        </div>
      </div>
    </div>
  );
}
