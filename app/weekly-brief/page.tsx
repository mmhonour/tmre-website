import type { Metadata } from "next";
import Link from "next/link";
import LeadForm from "@/components/LeadForm";
import WeeklyBriefContent from "@/components/WeeklyBriefContent";
import { buildMarketDigestSnapshot } from "@/lib/market-digest";
import { TMRE_CORE_TOWNS_LABEL } from "@/lib/tmre-towns";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Weekly Brief",
  description: `TMRE Weekly Brief — months supply, inventory, and Deal of the Week for ${TMRE_CORE_TOWNS_LABEL}, CT. Same content as the Monday market email.`,
  alternates: { canonical: "/weekly-brief" },
};

export default async function WeeklyBriefPage() {
  const snapshot = await buildMarketDigestSnapshot();
  const etDate = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(new Date(snapshot.generatedAt));

  return (
    <main className="bg-[#EEF1F6] min-h-[70vh]">
      <section className="pt-28 pb-6 lg:pt-36 lg:pb-8">
        <div className="mx-auto max-w-2xl px-6 lg:px-10 mb-8">
          <p className="font-mono text-[11px] tracking-[0.2em] uppercase text-gold mb-3">
            Resources
          </p>
          <h2 className="font-serif text-3xl sm:text-4xl text-navy leading-tight">
            Weekly Brief
          </h2>
          <p className="mt-3 text-slate text-base leading-relaxed max-w-xl">
            The live web edition of the Monday market brief — inventory, months
            supply, and Deal of the Week. Same snapshot the email uses; we&apos;ll
            refine this page over time.
          </p>
        </div>

        <div className="px-4 sm:px-6 lg:px-10 pb-12">
          <WeeklyBriefContent snapshot={snapshot} etDate={etDate} />
        </div>
      </section>

      <section className="relative py-14 lg:py-20 overflow-hidden navy-gradient">
        <div className="absolute inset-0 hero-grid opacity-40" aria-hidden />
        <div className="relative mx-auto max-w-3xl px-6 lg:px-10 text-center">
          <p className="font-mono text-[11px] tracking-[0.2em] uppercase text-gold mb-4">
            Get it Mondays
          </p>
          <h2 className="font-serif text-3xl sm:text-4xl text-white leading-[1.1]">
            Prefer inbox?{" "}
            <span className="italic text-gold">Join the brief.</span>
          </h2>
          <p className="mt-4 text-white/70 leading-relaxed">
            Same content, Monday morning. Or stay on the{" "}
            <Link href="/stats" className="text-gold underline underline-offset-2">
              live stats
            </Link>{" "}
            board anytime.
          </p>
          <div className="mt-8">
            <LeadForm source="weekly-brief" />
          </div>
        </div>
      </section>
    </main>
  );
}
