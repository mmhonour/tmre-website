import type { Metadata } from "next";
import Link from "next/link";
import FedDecisionTimeline from "@/components/fed-analysis/FedDecisionTimeline";
import FedDecisionsMiniGraph from "@/components/fed-analysis/FedDecisionsMiniGraph";
import FedEventsCalendar from "@/components/fed-analysis/FedEventsCalendar";
import FedPolicySnapshot from "@/components/fed-analysis/FedPolicySnapshot";
import FedRecentCpi from "@/components/fed-analysis/FedRecentCpi";
import FedRecentDecisions from "@/components/fed-analysis/FedRecentDecisions";
import { CPI_RELEASES, CPI_SCHEDULE_URL } from "@/lib/cpi-calendar";
import {
  getNextFomcMeeting,
  getPrevailingFedPolicy,
} from "@/lib/fed-fomc-calendar";
import { getFomcMeetingsFresh } from "@/lib/fed-fomc-sync";

const FOMC_CALENDAR_URL =
  "https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm";

export const metadata: Metadata = {
  title: "Fed Analysis — TMRE",
  description:
    "Federal Reserve FOMC meeting calendar, CPI release dates, rate decisions, and the prevailing federal funds target range — context for Fairfield County mortgage and housing costs.",
  alternates: { canonical: "/fed-analysis" },
};

export const dynamic = "force-dynamic";

export default async function FedAnalysisPage() {
  const now = new Date();
  const meetings = await getFomcMeetingsFresh();
  const prevailing = getPrevailingFedPolicy(now, meetings);
  const nextMeeting = getNextFomcMeeting(now, meetings);

  return (
    <>
      <section className="navy-gradient relative overflow-hidden pt-20 pb-10 text-white lg:pt-28 lg:pb-14">
        <div className="absolute inset-0 hero-grid opacity-40" aria-hidden />
        <div className="relative mx-auto max-w-7xl px-6 lg:px-10">
          <p className="mb-3 font-mono text-[11px] tracking-[0.2em] uppercase text-gold animate-fade-up">
            Markets
          </p>
          <h1 className="max-w-3xl font-serif text-4xl leading-[1.05] text-white sm:text-5xl lg:text-6xl animate-fade-up">
            Fed <span className="italic gold-shimmer">Analysis.</span>
          </h1>
          <p className="mt-4 max-w-2xl text-sm leading-relaxed text-white/70 lg:text-base animate-fade-up-delay-1">
            FOMC decisions, CPI release dates, and the prevailing federal funds
            target range — policy context for Fairfield County mortgage and
            housing costs.
          </p>
          <p className="mt-4 flex flex-wrap gap-x-4 gap-y-2 animate-fade-up-delay-2">
            <a
              href={FOMC_CALENDAR_URL}
              target="_blank"
              rel="noreferrer"
              className="font-mono text-[11px] tracking-[0.12em] uppercase text-gold underline decoration-gold/40 underline-offset-2 hover:decoration-gold"
            >
              Official FOMC calendar
            </a>
            <a
              href={CPI_SCHEDULE_URL}
              target="_blank"
              rel="noreferrer"
              className="font-mono text-[11px] tracking-[0.12em] uppercase text-gold underline decoration-gold/40 underline-offset-2 hover:decoration-gold"
            >
              BLS CPI schedule
            </a>
          </p>
        </div>
      </section>

      <section className="bg-cream py-10 lg:py-14">
        <div className="mx-auto max-w-7xl px-6 lg:px-10">
          <div className="mb-8">
            <FedPolicySnapshot
              prevailingFed={prevailing}
              nextMeeting={nextMeeting}
              releases={CPI_RELEASES}
              now={now}
            />
          </div>

          <div className="mb-8 grid gap-8 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] lg:items-start">
            <div>
              <FedEventsCalendar
                meetings={meetings}
                cpiReleases={CPI_RELEASES}
                initialYear={now.getFullYear()}
                initialMonth={now.getMonth()}
              />
            </div>
            <FedRecentCpi releases={CPI_RELEASES} />
          </div>

          <div className="mb-8 grid gap-8 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] lg:items-start">
            <FedDecisionsMiniGraph meetings={meetings} now={now} />
            <FedRecentDecisions meetings={meetings} />
          </div>

          <div className="mb-8">
            <FedDecisionTimeline meetings={meetings} now={now} />
          </div>

          <p className="text-xs leading-relaxed text-slate">
            Schedules:{" "}
            <a
              href={FOMC_CALENDAR_URL}
              target="_blank"
              rel="noreferrer"
              className="text-navy underline underline-offset-2"
            >
              Federal Reserve FOMC calendars
            </a>
            {" · "}
            <a
              href={CPI_SCHEDULE_URL}
              target="_blank"
              rel="noreferrer"
              className="text-navy underline underline-offset-2"
            >
              BLS CPI release schedule
            </a>
            . FOMC dates stay tentative until confirmed at the prior meeting.
            Statement excerpts are taken from the official release (stored via
            Admin Fed sync), not AI-written. Mortgage rates also move with term
            premiums and credit spreads — see{" "}
            <Link
              href="/market-pulse"
              className="text-navy underline underline-offset-2"
            >
              Market Pulse
            </Link>{" "}
            for local inventory context.
          </p>
        </div>
      </section>
    </>
  );
}
