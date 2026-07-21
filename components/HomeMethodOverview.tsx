"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import {
  interestingStatWarmUrls,
  type InterestingStatKind,
} from "@/lib/interesting-stat-link";
import { dealOfTheDayHref } from "@/lib/listing-url";
import { prefetchTabJson } from "@/lib/tab-data-prefetch";
import { TMRE_TOWNS, type TmreTown } from "@/lib/tmre-towns";

type ScoreSample = {
  town: TmreTown;
  score: number;
  mlsId: string;
  listingKey?: string | null;
};

type InterestingStat = {
  eyebrow: string;
  value: string;
  detail: string;
  href: string;
  kind?: InterestingStatKind;
  town?: TmreTown | null;
};

type SurfaceId = "intelligence" | "spotlight" | "statistics" | "whatif";

type SurfaceMock = {
  id: SurfaceId;
  name: string;
  href: string;
  /** Teaser spoken before this preview fades in. */
  teaser: string;
  rotate: string;
};

/** Buyer/seller objectives — each pill routes to a page that can fulfill it. */
const FILTER_SIGNALS = [
  { label: "Ready now", href: "/intelligence" },
  { label: "Room to grow", href: "/intelligence" },
  { label: "Ask vs worth", href: "/score" },
  { label: "Hold or list", href: "/score" },
  { label: "Walkable core", href: "/find" },
  { label: "Quiet street", href: "/find" },
  { label: "Below rebuild", href: "/fixer-uppers" },
  { label: "School fit", href: "/intelligence" },
  { label: "Light remodel", href: "/fixer-uppers" },
  { label: "Income angle", href: "/intelligence" },
] as const;

/** Stable off-level angles + vertical offsets so pills never sit on one straight line. */
const PILL_TILTS = [-3.6, 2.4, -1.8, 3.2, -2.7, 1.5, -3.1, 2.8, -1.2, 2.0] as const;
const PILL_Y = [-6, 8, 1, 10, -4, 7, -8, 4, 9, -3] as const;
const PILL_MIN_VISIBLE = 3;
const PILL_MAX_VISIBLE = 5;

const SURFACES: SurfaceMock[] = [
  {
    id: "intelligence",
    name: "Intelligence",
    href: "/intelligence",
    teaser: "Compare every listing…",
    rotate: "-5deg",
  },
  {
    id: "spotlight",
    name: "Spotlight",
    href: "/spotlight",
    teaser: "Today’s one pick…",
    rotate: "3.5deg",
  },
  {
    id: "statistics",
    name: "Statistics",
    href: "/stats",
    teaser: "See the charts…",
    rotate: "-2deg",
  },
  {
    id: "whatif",
    name: "What if",
    href: "/score",
    teaser: "Run a scenario…",
    rotate: "4deg",
  },
];

const SURFACE_TEASER_MS = 2400;
const SURFACE_FADE_MS = 1200;
const SURFACE_HOLD_MS = 7000;

/** Pill show/hide cadence — 75% slower than the original timers (×1.75). */
const PILL_TIME_SCALE = 1.75;
/**
 * Homepage primer: educate on the Goldilocks score, preview site surfaces,
 * and hand off to this week’s Deal of the Week — atmosphere from that listing.
 */
export default function HomeMethodOverview() {
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [samples, setSamples] = useState<ScoreSample[]>([]);
  const [sampleIndex, setSampleIndex] = useState(0);
  const [interestingStat, setInterestingStat] = useState<InterestingStat | null>(
    null,
  );

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
    fetch("/api/deal-of-the-day?bundle=1&kind=sale&property=homes", { cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return (await r.json()) as {
          deals?: Partial<
            Record<
              TmreTown,
              {
                score?: { composite?: number };
                listing?: {
                  mlsId?: string;
                  listingKey?: string | null;
                };
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
    let cancelled = false;
    fetch("/api/interesting-stat", { cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) return null;
        return (await r.json()) as InterestingStat;
      })
      .then((d) => {
        if (cancelled || !d?.value || !d?.detail) return;
        const next: InterestingStat = {
          eyebrow: d.eyebrow || "Interesting stat",
          value: d.value,
          detail: d.detail,
          href: d.href || "/stats",
          kind: d.kind,
          town: d.town ?? null,
        };
        setInterestingStat(next);
        // Warm the Stats chart APIs so the graph is ready on click.
        if (next.kind) {
          for (const url of interestingStatWarmUrls(next.kind, next.town ?? null)) {
            prefetchTabJson(url);
          }
        } else if (next.href.startsWith("/stats")) {
          prefetchTabJson("/api/stats/page?kind=sale");
        }
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

          {/* Deal of the Day score — gold shimmer over section atmosphere only. */}
          <div className="lg:col-span-6 flex flex-col items-end text-right animate-fade-up-delay-1">
            <div className="w-full max-w-md lg:max-w-lg ml-auto">
              <p className="font-mono text-[10px] tracking-[0.2em] uppercase text-gold/80 mb-2">
                Actual home · rotating towns
              </p>
              {live ? (
                <Link
                  href={dealOfTheDayHref(live.town, {
                    mlsId: live.mlsId,
                    listingKey: live.listingKey,
                    kind: "sale",
                    propertyClass: "homes",
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

              <p className="mt-3 text-xs text-white/45 max-w-sm ml-auto leading-relaxed">
                Today&apos;s pick in each town — tap the score to open that deal.
                Same yardstick as Deal of the Week.
              </p>

              {interestingStat ? (
                <Link
                  href={interestingStat.href}
                  onMouseEnter={() => {
                    if (!interestingStat.kind) return;
                    for (const url of interestingStatWarmUrls(
                      interestingStat.kind,
                      interestingStat.town ?? null,
                    )) {
                      prefetchTabJson(url);
                    }
                  }}
                  className="mt-4 ml-auto flex w-full flex-nowrap items-baseline justify-end gap-x-2.5 border border-transparent px-0 py-1 text-right cursor-pointer transition-opacity hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-gold/60 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent rounded-sm"
                  title="Open this chart on Statistics"
                >
                  <span className="shrink-0 font-mono text-[10px] tracking-[0.2em] uppercase text-gold">
                    {interestingStat.eyebrow}
                  </span>
                  <span className="shrink-0 font-serif italic text-2xl sm:text-3xl text-white leading-none underline decoration-gold/35 underline-offset-4">
                    {interestingStat.value}
                  </span>
                  <span className="min-w-0 truncate text-xs text-white/60 leading-none">
                    {interestingStat.detail}
                  </span>
                </Link>
              ) : null}
            </div>
          </div>
        </div>

        {/* Rotating surface previews + objective pills */}
        <div className="mt-12 lg:mt-16 relative animate-fade-up-delay-2">
          <p className="font-mono text-[10px] tracking-[0.18em] uppercase text-white/40 mb-4">
            Same measure · different rooms of the site
          </p>

          <HomeSurfaceStage />
          <HomeObjectivePills />
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

type SurfacePhase = "teaser" | "in" | "hold" | "out";

/**
 * One primary preview + a faint outgoing card. Teaser copy plays before each
 * fade-in so the next room of the site is announced.
 */
function HomeSurfaceStage() {
  const [index, setIndex] = useState(0);
  const [prevIndex, setPrevIndex] = useState<number | null>(null);
  const [phase, setPhase] = useState<SurfacePhase>("teaser");
  const [cardOpacity, setCardOpacity] = useState(0);
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    setReduceMotion(
      window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    );
  }, []);

  useEffect(() => {
    if (phase === "teaser") {
      setCardOpacity(0);
      return;
    }
    if (phase === "hold") {
      setCardOpacity(1);
      return;
    }
    if (phase === "out") {
      setCardOpacity(0);
      return;
    }
    // "in" — mount at 0, then fade up on the next frame.
    setCardOpacity(0);
    const raf = window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => setCardOpacity(1));
    });
    return () => window.cancelAnimationFrame(raf);
  }, [phase, index]);

  useEffect(() => {
    if (reduceMotion) {
      setPhase("hold");
      setCardOpacity(1);
      const id = window.setInterval(() => {
        setPrevIndex(null);
        setIndex((i) => (i + 1) % SURFACES.length);
      }, SURFACE_TEASER_MS + SURFACE_HOLD_MS);
      return () => window.clearInterval(id);
    }

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const schedule = (ms: number, fn: () => void) => {
      timer = setTimeout(() => {
        if (!cancelled) fn();
      }, ms);
    };

    if (phase === "teaser") {
      schedule(SURFACE_TEASER_MS, () => setPhase("in"));
    } else if (phase === "in") {
      schedule(SURFACE_FADE_MS, () => {
        setPrevIndex(null);
        setPhase("hold");
      });
    } else if (phase === "hold") {
      schedule(SURFACE_HOLD_MS, () => setPhase("out"));
    } else {
      schedule(SURFACE_FADE_MS, () => {
        setPrevIndex(index);
        setIndex((i) => (i + 1) % SURFACES.length);
        setPhase("teaser");
      });
    }

    return () => {
      cancelled = true;
      if (timer != null) clearTimeout(timer);
    };
  }, [phase, index, reduceMotion]);

  const current = SURFACES[index]!;
  const outgoing =
    prevIndex != null && prevIndex !== index ? SURFACES[prevIndex]! : null;
  const showTeaser = phase === "teaser" || phase === "out";
  const showCard = phase !== "teaser" || cardOpacity > 0;

  return (
    <div className="relative mb-6 min-h-[14.5rem] sm:min-h-[16rem]">
      <div
        className="absolute left-0 right-0 top-0 z-20 flex h-10 items-center"
        aria-live="polite"
      >
        <p
          key={`${current.id}-teaser`}
          className={`font-mono text-[11px] sm:text-xs tracking-[0.16em] uppercase text-gold/90 ${
            showTeaser ? "opacity-100 home-surface-teaser" : "opacity-0"
          }`}
        >
          {current.teaser}
        </p>
      </div>

      <div className="relative mt-10 h-[12.5rem] sm:h-[14rem]">
        {outgoing ? (
          <div
            className="home-surface-card absolute left-[8%] sm:left-[18%] top-2 z-10 w-[10.5rem] sm:w-[12.5rem] pointer-events-none"
            style={{
              transform: `rotate(${outgoing.rotate}) scale(0.94)`,
              opacity: 0.32,
            }}
            aria-hidden
          >
            <div className="rounded-xl border border-white/10 bg-navy-dark/80 backdrop-blur-md shadow-lg shadow-black/30 overflow-hidden">
              <SurfacePagePreview id={outgoing.id} name={outgoing.name} />
            </div>
          </div>
        ) : null}

        {showCard ? (
          <Link
            href={current.href}
            className="home-surface-card absolute left-[18%] sm:left-[28%] top-0 z-20 w-[11rem] sm:w-[13rem] group"
            style={{
              transform: `rotate(${current.rotate}) translateY(${
                cardOpacity > 0.5 ? "0" : "0.35rem"
              })`,
              opacity: cardOpacity,
              transition: `opacity ${SURFACE_FADE_MS}ms ease, transform ${SURFACE_FADE_MS}ms ease`,
            }}
            aria-label={`Open ${current.name}`}
          >
            <div className="rounded-xl border border-white/15 bg-navy-dark/90 backdrop-blur-md shadow-xl shadow-black/40 overflow-hidden transition-transform duration-300 group-hover:-translate-y-1 group-hover:border-gold/40">
              <SurfacePagePreview id={current.id} name={current.name} />
            </div>
          </Link>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Objective pills — each fades in/out on its own random timer (not as a pack),
 * and each keeps a fixed crooked tilt + vertical offset so the row never looks level.
 */
function HomeObjectivePills() {
  const [visible, setVisible] = useState<boolean[]>(() =>
    FILTER_SIGNALS.map((_, i) => i < PILL_MAX_VISIBLE),
  );

  useEffect(() => {
    const timers: Array<ReturnType<typeof setTimeout> | null> = FILTER_SIGNALS.map(
      () => null,
    );
    let cancelled = false;

    const countVisible = (flags: boolean[]) =>
      flags.reduce((n, on) => n + (on ? 1 : 0), 0);

    const clearTimer = (i: number) => {
      const t = timers[i];
      if (t != null) clearTimeout(t);
      timers[i] = null;
    };

    const schedule = (i: number, fn: () => void, ms: number) => {
      clearTimer(i);
      timers[i] = setTimeout(() => {
        if (!cancelled) fn();
      }, ms);
    };

    const hidePill = (i: number) => {
      setVisible((prev) => {
        if (!prev[i]) return prev;
        if (countVisible(prev) <= PILL_MIN_VISIBLE) {
          // Can't drop below the floor — try again later.
          schedule(
            i,
            () => hidePill(i),
            (1200 + Math.random() * 1800) * PILL_TIME_SCALE,
          );
          return prev;
        }
        const next = [...prev];
        next[i] = false;
        schedule(
          i,
          () => showPill(i),
          (700 + Math.random() * 2200) * PILL_TIME_SCALE,
        );
        return next;
      });
    };

    const showPill = (i: number) => {
      setVisible((prev) => {
        if (prev[i]) return prev;
        if (countVisible(prev) >= PILL_MAX_VISIBLE) {
          schedule(
            i,
            () => showPill(i),
            (900 + Math.random() * 1600) * PILL_TIME_SCALE,
          );
          return prev;
        }
        const next = [...prev];
        next[i] = true;
        schedule(
          i,
          () => hidePill(i),
          (2200 + Math.random() * 3800) * PILL_TIME_SCALE,
        );
        return next;
      });
    };

    // Kick each pill on its own phase so they don’t sync.
    FILTER_SIGNALS.forEach((_, i) => {
      const startVisible = i < PILL_MAX_VISIBLE;
      if (startVisible) {
        schedule(
          i,
          () => hidePill(i),
          (1400 + Math.random() * 3200 + i * 180) * PILL_TIME_SCALE,
        );
      } else {
        schedule(
          i,
          () => showPill(i),
          (800 + Math.random() * 2800 + i * 120) * PILL_TIME_SCALE,
        );
      }
    });

    return () => {
      cancelled = true;
      timers.forEach((t, i) => {
        if (t != null) clearTimeout(t);
        timers[i] = null;
      });
    };
  }, []);

  return (
    <div className="relative mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-3 max-w-3xl min-h-[3.75rem] content-center">
      {FILTER_SIGNALS.map((pill, idx) => {
        if (!visible[idx]) return null;
        return (
          <span
            key={pill.label}
            className="inline-block home-filter-chip-enter"
            style={{
              transform: `rotate(${PILL_TILTS[idx % PILL_TILTS.length]}deg) translateY(${
                PILL_Y[idx % PILL_Y.length]
              }px)`,
              zIndex: 40 - idx,
            }}
          >
            <Link
              href={pill.href}
              className="home-filter-chip inline-flex items-center rounded-full border border-white/20 bg-white/[0.07] px-3 py-1 font-mono text-[10px] tracking-[0.12em] uppercase text-white/75 backdrop-blur-sm transition-colors hover:border-gold/45 hover:text-gold"
            >
              {pill.label}
            </Link>
          </span>
        );
      })}
    </div>
  );
}

/** Miniature page chrome so each card reads as that product surface, not a blank browser. */
function SurfacePagePreview({ id, name }: { id: SurfaceId; name: string }) {
  switch (id) {
    case "intelligence":
      return (
        <div className="bg-[#F5F1E8] text-navy" aria-hidden>
          <div className="bg-gradient-to-br from-[#1C2A3A] to-[#0F1824] px-2.5 pt-2 pb-2">
            <p className="font-mono text-[7px] tracking-[0.16em] uppercase text-[#C8A951]/80">
              Market
            </p>
            <p className="font-serif text-[11px] text-white leading-tight">
              Intelligence{" "}
              <span className="italic text-[#D8BC6E]">board</span>
            </p>
            <div className="mt-1.5 flex gap-1">
              {["All", "Sale", "Zip"].map((t) => (
                <span
                  key={t}
                  className="rounded-full border border-white/20 px-1.5 py-0.5 font-mono text-[6px] uppercase text-white/70"
                >
                  {t}
                </span>
              ))}
            </div>
          </div>
          <div className="px-2 py-1.5 space-y-1">
            {[
              { s: "9.1", w: "88%" },
              { s: "8.4", w: "72%" },
              { s: "7.8", w: "64%" },
            ].map((row) => (
              <div
                key={row.s}
                className="flex items-center gap-1.5 rounded-md border border-charcoal/10 bg-white px-1.5 py-1 shadow-sm"
              >
                <span className="font-serif italic text-[10px] text-[#C8A951] w-5 shrink-0">
                  {row.s}
                </span>
                <div className="min-w-0 flex-1 space-y-0.5">
                  <div
                    className="h-1 rounded-full bg-navy/20"
                    style={{ width: row.w }}
                  />
                  <div className="h-0.5 rounded-full bg-navy/10 w-2/3" />
                </div>
              </div>
            ))}
          </div>
          <p className="px-2.5 pb-1.5 font-mono text-[7px] tracking-[0.14em] uppercase text-navy/45">
            {name}
          </p>
        </div>
      );

    case "spotlight":
      return (
        <div className="bg-[#0F1824] text-white" aria-hidden>
          <div className="relative h-[4.25rem] bg-gradient-to-br from-[#3D4F66] via-[#2A3A4D] to-[#1C2A3A]">
            <div className="absolute inset-0 opacity-40 bg-[radial-gradient(ellipse_at_30%_20%,rgba(200,169,81,0.35),transparent_55%)]" />
            <div className="absolute top-1.5 right-1.5 rounded-md border border-gold/40 bg-navy-dark/70 px-1.5 py-0.5">
              <span className="font-serif italic text-[12px] text-[#D8BC6E]">
                8.7
              </span>
            </div>
            <div className="absolute bottom-1.5 left-2 right-2">
              <p className="font-mono text-[6px] tracking-[0.14em] uppercase text-white/50">
                Featured listing
              </p>
              <p className="font-serif text-[10px] text-white truncate">
                14 Harbor Lane
              </p>
            </div>
          </div>
          <div className="flex gap-1 px-2 py-1.5 border-b border-white/10">
            {["Home", "Photos", "Comps", "If"].map((t, i) => (
              <span
                key={t}
                className={`rounded px-1 py-0.5 font-mono text-[6px] uppercase ${
                  i === 0
                    ? "bg-gold/20 text-gold"
                    : "text-white/40"
                }`}
              >
                {t}
              </span>
            ))}
          </div>
          <div className="px-2.5 py-1.5 space-y-1">
            <div className="h-1 rounded-full bg-white/15 w-[80%]" />
            <div className="h-1 rounded-full bg-white/10 w-[55%]" />
            <p className="font-mono text-[7px] tracking-[0.14em] uppercase text-white/40 pt-0.5">
              {name}
            </p>
          </div>
        </div>
      );

    case "statistics":
      return (
        <div className="bg-[#F5F1E8] text-navy" aria-hidden>
          <div className="bg-gradient-to-br from-[#1C2A3A] to-[#0F1824] px-2.5 pt-2 pb-1.5">
            <p className="font-serif text-[11px] text-white leading-tight">
              Numbers, <span className="italic text-[#D8BC6E]">live!</span>
            </p>
            <div className="mt-1 flex gap-1">
              {["#38A3C8", "#C8A951", "#E07A5F", "#7BA17B"].map((c) => (
                <span
                  key={c}
                  className="h-1.5 w-1.5 rounded-full"
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>
          <div className="px-2.5 pt-2 pb-1 flex items-end gap-1 h-14">
            {[40, 68, 52, 85, 60, 74, 48].map((h, i) => (
              <div
                key={i}
                className="flex-1 rounded-t-sm"
                style={{
                  height: `${h}%`,
                  backgroundColor:
                    ["#38A3C8", "#C8A951", "#E07A5F", "#7BA17B", "#38A3C8", "#C8A951", "#E07A5F"][
                      i
                    ],
                  opacity: 0.85,
                }}
              />
            ))}
          </div>
          <div className="px-2.5 pb-1.5 space-y-0.5">
            <div className="h-1 rounded-full bg-navy/15 w-full" />
            <div className="h-1 rounded-full bg-navy/10 w-4/5" />
            <p className="font-mono text-[7px] tracking-[0.14em] uppercase text-navy/45 pt-0.5">
              {name}
            </p>
          </div>
        </div>
      );

    case "whatif":
      return (
        <div className="bg-[#0F1824] text-white" aria-hidden>
          <div className="px-2.5 pt-2 pb-1 border-b border-white/10">
            <p className="font-mono text-[7px] tracking-[0.16em] uppercase text-[#C8A951]/80">
              Scenarios
            </p>
            <p className="font-serif text-[11px] text-white leading-tight">
              What <span className="italic text-[#D8BC6E]">if</span>
            </p>
          </div>
          <div className="grid grid-cols-3 gap-1 p-2">
            {["Buy", "Sell", "Hold"].map((label, i) => (
              <div
                key={label}
                className="rounded-md border border-white/10 bg-white/[0.04] px-1 py-1.5"
              >
                <p className="font-mono text-[6px] tracking-[0.12em] uppercase text-gold/90">
                  {label}
                </p>
                <p className="mt-0.5 font-serif italic text-[11px] text-white">
                  {["$1.2M", "$1.4M", "7.6"][i]}
                </p>
                <div className="mt-1 h-0.5 rounded-full bg-gold/40 w-3/4" />
              </div>
            ))}
          </div>
          <p className="px-2.5 pb-1.5 font-mono text-[7px] tracking-[0.14em] uppercase text-white/40">
            {name}
          </p>
        </div>
      );
  }
}
