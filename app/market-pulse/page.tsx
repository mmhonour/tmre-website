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
    <main
      style={marketPulseThemeCssVars(theme) as CSSProperties}
      className="market-pulse-theme min-h-[70vh] bg-[var(--mp-page-bg)] [font-family:var(--mp-body-font)]"
    >
      <section className="pt-28 pb-6 lg:pt-36 lg:pb-8">
        <div className="mx-auto max-w-2xl px-6 lg:px-10 mb-8">
          <p className="[font-family:var(--mp-mono-font)] text-[11px] tracking-[0.2em] uppercase text-[var(--mp-accent)] mb-3">
            Markets
          </p>
          <h1 className="[font-family:var(--mp-heading-font)] text-3xl sm:text-4xl text-[var(--mp-text)] leading-tight">
            Market Pulse
          </h1>
          <p className="mt-3 text-[var(--mp-muted-text)] text-base leading-relaxed max-w-xl">
            The live web edition of the Monday market brief — inventory and
            months supply by category (ALL, SFR, Condo, Rentals, Commercial),
            plus Deal of the Week on ALL. Same ALL-sales snapshot we email each
            week.
          </p>
          <p className="mt-2 [font-family:var(--mp-mono-font)] text-[10px] tracking-[0.12em] uppercase text-[var(--mp-muted-text)] opacity-70">
            As of {etDate} ET
          </p>
        </div>

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
  );
}
