"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { dealOfTheDayHref } from "@/lib/listing-url";
import { TMRE_TOWNS, type TmreTown } from "@/lib/tmre-towns";

type ScoreSample = {
  town: TmreTown;
  score: number;
  mlsId: string;
  listingKey?: string | null;
};

type SurfaceMock = {
  name: string;
  href: string;
  eyebrow: string;
  line: string;
  rotate: string;
  z: string;
  offset: string;
};

/** Buyer/seller objectives — not listing field names. */
const FILTER_SIGNALS = [
  "Ready now",
  "Room to grow",
  "Ask vs worth",
  "Hold or list",
  "Walkable core",
  "Quiet street",
  "Below rebuild",
  "School fit",
  "Light remodel",
  "Income angle",
] as const;

const SURFACES: SurfaceMock[] = [
  {
    name: "Intelligence",
    href: "/intelligence",
    eyebrow: "Shortlist",
    line: "Ranked actives — where to look first",
    rotate: "-6deg",
    z: "z-30",
    offset: "left-0 top-6 sm:top-4",
  },
  {
    name: "Spotlight",
    href: "/spotlight",
    eyebrow: "Featured",
    line: "A home under the microscope",
    rotate: "3deg",
    z: "z-20",
    offset: "left-[12%] sm:left-[18%] top-0",
  },
  {
    name: "Statistics",
    href: "/stats",
    eyebrow: "Market",
    line: "Town pulse without the noise",
    rotate: "-2deg",
    z: "z-10",
    offset: "left-[28%] sm:left-[36%] top-10 sm:top-8",
  },
  {
    name: "What if",
    href: "/score",
    eyebrow: "Scenarios",
    line: "Buy · sell · hold — before you commit",
    rotate: "5deg",
    z: "z-[5]",
    offset: "left-[42%] sm:left-[52%] top-2 sm:top-0",
  },
];

/**
 * Homepage primer: educate on the Goldilocks score, preview site surfaces,
 * and hand off to this week’s Deal of the Week — atmosphere from that listing.
 */
export default function HomeMethodOverview() {
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [samples, setSamples] = useState<ScoreSample[]>([]);
  const [sampleIndex, setSampleIndex] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/deal-of-the-week", { cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) return null;
        return (await r.json()) as { photoUrl?: string | null };
      })
      .then((d) => {
        if (cancelled || !d?.photoUrl) return;
        setPhotoUrl(d.photoUrl);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/deal-of-the-day?bundle=1&kind=sale", { cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return (await r.json()) as {
          deals?: Partial<
            Record<
              TmreTown,
              {
                score?: { composite?: number };
                listing?: { mlsId?: string; listingKey?: string | null };
              }
            >
          >;
        };
      })
      .then((payload) => {
        if (cancelled) return;
        const next: ScoreSample[] = [];
        for (const town of TMRE_TOWNS) {
          const deal = payload.deals?.[town];
          const score = deal?.score?.composite;
          const mlsId = deal?.listing?.mlsId?.trim();
          if (typeof score !== "number" || !mlsId) continue;
          next.push({
            town,
            score,
            mlsId,
            listingKey: deal?.listing?.listingKey ?? null,
          });
        }
        if (next.length > 0) setSamples(next);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (samples.length < 2) return;
    const id = window.setInterval(() => {
      setSampleIndex((i) => (i + 1) % samples.length);
    }, 1100);
    return () => window.clearInterval(id);
  }, [samples.length]);

  const live = samples[sampleIndex] ?? null;

  return (
    <section className="relative overflow-hidden text-white pt-20 pb-12 lg:pt-24 lg:pb-14">
      {/* Atmosphere: this week’s listing photo */}
      <div className="absolute inset-0" aria-hidden>
        {photoUrl ? (
          <Image
            src={photoUrl}
            alt=""
            fill
            priority
            unoptimized
            className="object-cover scale-105"
            sizes="100vw"
          />
        ) : (
          <div className="absolute inset-0 navy-gradient" />
        )}
        <div className="absolute inset-0 bg-gradient-to-b from-navy-dark/88 via-navy/82 to-navy-dark/92" />
        <div className="absolute inset-0 hero-grid opacity-30" />
      </div>

      <div className="relative mx-auto max-w-7xl px-6 lg:px-10">
        <div className="grid lg:grid-cols-12 gap-10 lg:gap-8 items-start">
          {/* Copy column */}
          <div className="lg:col-span-6 min-w-0">
            <div className="flex items-center gap-3 mb-4 animate-fade-up">
              <div className="relative w-10 h-8 shrink-0 opacity-90">
                <Image
                  src="/images/four-lens-camera.png"
                  alt=""
                  fill
                  className="object-contain brightness-110 contrast-110"
                  sizes="40px"
                  priority
                />
              </div>
              <p className="font-mono text-[11px] tracking-[0.2em] uppercase text-gold">
                TMRE
              </p>
            </div>

            <h1 className="font-serif text-4xl sm:text-5xl lg:text-[3.35rem] text-white leading-[1.05] animate-fade-up">
              Cut through the noise.{" "}
              <span className="italic text-gold-light">One clear score.</span>
            </h1>

            <p className="mt-5 text-base lg:text-lg text-white/75 leading-relaxed max-w-xl animate-fade-up-delay-1">
              Listings shout. Headlines contradict. We give buyers and sellers a
              single, town-calibrated measure — so you walk into Intelligence,
              Spotlight, Statistics, and What if already knowing how to read the
              room.
            </p>

            <p className="mt-4 text-sm text-white/55 leading-relaxed max-w-xl animate-fade-up-delay-1">
              High means the home clears the bar against what&rsquo;s active
              nearby. Softer means dig deeper — or price with eyes open if you
              are selling. Same yardstick everywhere on the site.
            </p>

            <div className="mt-7 flex flex-wrap items-center gap-x-5 gap-y-3 animate-fade-up-delay-2">
              <Link
                href="/score"
                className="inline-flex items-center rounded-lg bg-gold px-4 py-2.5 font-mono text-[11px] tracking-[0.14em] uppercase text-navy-dark hover:bg-gold-light transition-colors"
              >
                How scoring works
              </Link>
              <Link
                href="/intelligence"
                className="font-mono text-[11px] tracking-[0.14em] uppercase text-white/70 hover:text-gold transition-colors"
              >
                Open Intelligence →
              </Link>
            </div>
          </div>

          {/* Deal of the Day score — same serif as “This week's ##.” */}
          <div className="lg:col-span-6 flex flex-col items-start lg:items-end animate-fade-up-delay-1">
            <p className="font-mono text-[10px] tracking-[0.2em] uppercase text-gold/90 mb-2">
              Deal of the Day · rotating towns
            </p>
            <div className="relative w-full max-w-md lg:max-w-none lg:text-right">
              {live ? (
                <Link
                  href={dealOfTheDayHref(live.town, {
                    mlsId: live.mlsId,
                    listingKey: live.listingKey,
                    kind: "sale",
                  })}
                  className="group block focus:outline-none focus-visible:ring-2 focus-visible:ring-gold/60 focus-visible:ring-offset-2 focus-visible:ring-offset-navy-dark rounded-sm"
                  aria-label={`Open ${live.town} Deal of the Day, score ${live.score.toFixed(1)}`}
                >
                  <p
                    key={`${live.town}-${live.score}-${live.mlsId}`}
                    className="font-serif italic gold-shimmer leading-[1.05] tracking-tight home-score-swap text-[5.5rem] sm:text-[7rem] lg:text-[8.5rem] transition-opacity group-hover:opacity-90"
                  >
                    {live.score.toFixed(1)}.
                  </p>
                  <p className="mt-2 font-serif italic text-2xl sm:text-3xl text-white/90 group-hover:text-gold transition-colors">
                    {live.town}
                  </p>
                </Link>
              ) : (
                <>
                  <p className="font-serif italic text-white/40 leading-[1.05] tracking-tight text-[5.5rem] sm:text-[7rem] lg:text-[8.5rem]">
                    —.—
                  </p>
                  <p className="mt-2 font-serif italic text-2xl sm:text-3xl text-white/90">
                    Scanning markets…
                  </p>
                </>
              )}
              <p className="mt-3 text-xs text-white/45 max-w-sm lg:ml-auto leading-relaxed">
                Today&apos;s pick in each town — tap the score to open that deal.
                Same yardstick as Deal of the Week.
              </p>
            </div>
          </div>
        </div>

        {/* Overlapping product surfaces + filter signals */}
        <div className="mt-12 lg:mt-16 relative min-h-[14rem] sm:min-h-[16rem] animate-fade-up-delay-2">
          <p className="font-mono text-[10px] tracking-[0.18em] uppercase text-white/40 mb-4">
            Same measure · different rooms of the site
          </p>

          <div className="relative h-44 sm:h-52">
            {SURFACES.map((surface) => (
              <Link
                key={surface.name}
                href={surface.href}
                className={`absolute w-[9.5rem] sm:w-[11.5rem] ${surface.offset} ${surface.z} home-surface-card group`}
                style={{ transform: `rotate(${surface.rotate})` }}
              >
                <div className="rounded-xl border border-white/15 bg-navy-dark/80 backdrop-blur-md shadow-xl shadow-black/40 overflow-hidden transition-transform duration-300 group-hover:-translate-y-1 group-hover:border-gold/40">
                  <div className="flex items-center gap-1.5 px-2.5 py-1.5 border-b border-white/10 bg-white/[0.04]">
                    <span className="w-1.5 h-1.5 rounded-full bg-coral/80" />
                    <span className="w-1.5 h-1.5 rounded-full bg-gold/70" />
                    <span className="w-1.5 h-1.5 rounded-full bg-sage/70" />
                    <span className="ml-1 font-mono text-[8px] tracking-[0.12em] uppercase text-white/35 truncate">
                      {surface.name.toLowerCase()}
                    </span>
                  </div>
                  <div className="px-3 py-3">
                    <p className="font-mono text-[9px] tracking-[0.16em] uppercase text-gold mb-1">
                      {surface.eyebrow}
                    </p>
                    <p className="font-serif text-sm text-white leading-snug">
                      {surface.name}
                    </p>
                    <p className="mt-1.5 text-[11px] text-white/50 leading-snug">
                      {surface.line}
                    </p>
                    <div className="mt-3 space-y-1" aria-hidden>
                      <div className="h-1 rounded-full bg-white/10 w-[88%]" />
                      <div className="h-1 rounded-full bg-white/10 w-[62%]" />
                      <div className="h-1 rounded-full bg-gold/35 w-[40%]" />
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>

          {/* Overlapping comparison criteria */}
          <div className="relative mt-2 sm:mt-0 flex flex-wrap gap-2 max-w-3xl">
            {FILTER_SIGNALS.map((label, i) => (
              <span
                key={label}
                className="home-filter-chip inline-flex items-center rounded-full border border-white/20 bg-white/[0.07] px-3 py-1 font-mono text-[10px] tracking-[0.12em] uppercase text-white/75 backdrop-blur-sm"
                style={{
                  transform: `rotate(${((i % 5) - 2) * 1.4}deg) translateY(${
                    (i % 3) * 2
                  }px)`,
                  zIndex: 40 - i,
                }}
              >
                {label}
              </span>
            ))}
          </div>
          <p className="mt-4 text-xs text-white/40 max-w-lg leading-relaxed">
            Dynamic criteria for comparing properties — layered the way real
            decisions are made, not as a spreadsheet dump.
          </p>
        </div>

        <div className="mt-10 lg:mt-12 flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-2 border-t border-white/10 pt-6">
          <p className="font-mono text-[11px] tracking-[0.2em] uppercase text-gold">
            This week&rsquo;s one listing
          </p>
          <p className="text-sm text-white/55 max-w-md sm:text-right leading-relaxed">
            The home that cleared the bar — photo above is from that pick.
          </p>
        </div>
      </div>
    </section>
  );
}
