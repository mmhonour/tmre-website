import type { Metadata } from "next";
import Link from "next/link";
import FedPolicySnapshot from "@/components/fed-analysis/FedPolicySnapshot";
import FedRecentCpi from "@/components/fed-analysis/FedRecentCpi";
import FedRecentDecisions from "@/components/fed-analysis/FedRecentDecisions";
import FedTimelinePair from "@/components/fed-analysis/FedTimelinePair";
import MarketsPageTabs from "@/components/markets/MarketsPageTabs";
import { CPI_SCHEDULE_URL } from "@/lib/cpi-calendar";
import { getCpiReleasesFresh } from "@/lib/cpi-release-sync";
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
  const [meetings, releases] = await Promise.all([
    getFomcMeetingsFresh(),
    getCpiReleasesFresh(),
  ]);
  const prevailing = getPrevailingFedPolicy(now, meetings);
  const nextMeeting = getNextFomcMeeting(now, meetings);

  return (
    <>
      <section className="navy-gradient relative overflow-hidden pt-20 pb-0 text-white lg:pt-28">
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
            <Link
              href="/mortgage-rates"
              className="font-mono text-[11px] tracking-[0.12em] uppercase text-gold underline decoration-gold/40 underline-offset-2 hover:decoration-gold"
            >
              Mortgage rates
            </Link>
            <Link
              href="/trends"
              className="font-mono text-[11px] tracking-[0.12em] uppercase text-gold underline decoration-gold/40 underline-offset-2 hover:decoration-gold"
            >
              Trends
            </Link>
          </p>
          <MarketsPageTabs active="fed-analysis" />
        </div>
      </section>

      <section className="bg-cream py-10 lg:py-14">
        <div className="mx-auto max-w-7xl px-6 lg:px-10">
          {/* FOMC decision (+ upcoming FOMC) | Prevailing CPI (+ upcoming CPI) */}
          <div className="mb-8">
            <FedPolicySnapshot
              prevailingFed={prevailing}
              nextMeeting={nextMeeting}
              meetings={meetings}
              releases={releases}
              now={now}
            />
          </div>

          {/* FOMC + CPI timelines — separate or overlay */}
          <div className="mb-8">
            <FedTimelinePair
              meetings={meetings}
              releases={releases}
              now={now}
              defaultLookback="all"
            />
          </div>

          {/* Recent Fed decisions | Recent CPI prints */}
          <div className="mb-8 grid gap-8 lg:grid-cols-2 lg:items-start">
            <FedRecentDecisions meetings={meetings} />
            <FedRecentCpi releases={releases} />
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
            FOMC and CPI excerpts are taken from the official releases (stored
            via Admin Fed sync), not AI-written. Mortgage rates also move with term
            premiums and credit spreads — see{" "}
            <Link
              href="/market-pulse"
              className="text-navy underline underline-offset-2"
            >
              Market Pulse
            </Link>{" "}
            for local inventory context, and{" "}
            <Link
              href="/trends"
              className="text-navy underline underline-offset-2"
            >
              Trends
            </Link>{" "}
            for official NAR sales and pending.
          </p>
        </div>
      </section>
    </>
  );
}
