import type { Metadata } from "next";
import type { CSSProperties } from "react";
import Link from "next/link";
import LeadForm from "@/components/LeadForm";
import MarketPulseContent from "@/components/MarketPulseContent";
import { buildMarketDigestSnapshot } from "@/lib/market-digest";
import {
  getMarketPulseThemeFresh,
  marketPulseThemeCssVars,
} from "@/lib/page-theme-config";
import { TMRE_CORE_TOWNS_LABEL } from "@/lib/tmre-towns";

export const dynamic = "force-dynamic";
/** Commercial tab hits Neon for Active + recent Closed; keep under Netlify's SSR budget. */
export const maxDuration = 26;

export const metadata: Metadata = {
  title: "Market Pulse",
  description: `TMRE Market Pulse — live web preview of the Monday market brief for ${TMRE_CORE_TOWNS_LABEL}, CT: months supply, inventory, and Deal of the Week.`,
  alternates: { canonical: "/market-pulse" },
};

export default async function MarketPulsePage() {
  const [snapshot, theme] = await Promise.all([
    buildMarketDigestSnapshot(),
    getMarketPulseThemeFresh(),
  ]);
  const etDate = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(new Date(snapshot.generatedAt));

  return (
    <>
      <section className="navy-gradient text-white pt-20 pb-8 lg:pt-28 lg:pb-12 relative overflow-hidden">
        <div className="absolute inset-0 hero-grid opacity-40" aria-hidden />
        <div className="relative mx-auto max-w-7xl px-6 lg:px-10">
          <p className="font-mono text-[11px] tracking-[0.2em] uppercase text-gold mb-3 animate-fade-up">
            Markets
          </p>
          <h1 className="font-serif text-4xl sm:text-5xl lg:text-6xl text-white leading-[1.05] max-w-3xl animate-fade-up">
            Market <span className="italic gold-shimmer">Pulse.</span>
          </h1>
          <p className="mt-3 text-sm lg:text-base text-white/70 max-w-2xl leading-relaxed animate-fade-up-delay-1">
            The live web edition of the Monday brief for {TMRE_CORE_TOWNS_LABEL}{" "}
            — active inventory, months supply, and closed sales across the
            trailing two years, by town and property type, plus Deal of the Week.
          </p>
          <p className="mt-4 font-mono text-[10px] tracking-[0.14em] uppercase text-white/45 animate-fade-up-delay-2">
            As of {etDate} ET
          </p>
        </div>
      </section>

      <main
        style={marketPulseThemeCssVars(theme) as CSSProperties}
        className="market-pulse-theme min-h-[50vh] bg-[var(--mp-page-bg)] [font-family:var(--mp-body-font)]"
      >
        <section className="pt-8 pb-6 lg:pt-10 lg:pb-8">
          <div className="px-4 sm:px-6 lg:px-10 pb-12">
            <MarketPulseContent snapshot={snapshot} etDate={etDate} />
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
              Same Market Pulse content, Monday morning. Or stay on the{" "}
              <Link
                href="/stats"
                className="text-gold underline underline-offset-2"
              >
                live stats
              </Link>{" "}
              board anytime.
            </p>
            <div className="mt-8">
              <LeadForm source="market-pulse" />
            </div>
          </div>
        </section>
      </main>
    </>
  );
}
