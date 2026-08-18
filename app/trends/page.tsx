import type { Metadata } from "next";
import MarketsPageTabs from "@/components/markets/MarketsPageTabs";
import {
  ensureExistingHomesFresh,
  isFredConfigured,
  readExistingHomesSeries,
  readNarHousingSyncMeta,
  readNarPendingSnapshot,
} from "@/lib/existing-homes-sync";
import {
  EXISTING_HOMES_NORTHEAST_SERIES,
  EXISTING_HOMES_US_SERIES,
  FRED_NAR_RELEASE_URL,
  NAR_EXISTING_HOME_SALES_URL,
  NAR_PENDING_HOME_SALES_URL,
  formatExistingHomesValue,
  formatObsMonth,
  formatObsMonthShort,
  formatPctChange,
  fredHousingSeriesUrl,
  pctChange,
  type ExistingHomesSeriesData,
  type ExistingHomesSeriesId,
  type ExistingHomesSeriesMeta,
  type NarPendingSnapshot,
} from "@/lib/existing-homes-shared";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Trends — TMRE",
  description:
    "Official NAR existing-home sales, inventory, months of supply, and median prices via FRED, plus NAR pending home sales — national and Northeast context for Fairfield County.",
  alternates: { canonical: "/trends" },
};

const eyebrow = "font-mono text-[11px] tracking-[0.2em] uppercase text-gold";
const sectionLabel =
  "font-mono text-[11px] tracking-[0.2em] uppercase text-slate mb-5";
const card =
  "rounded-2xl bg-white border border-charcoal/[0.08] p-6 lg:p-8 space-y-3";
const body = "text-charcoal/75 leading-relaxed";

function formatUpdatedAt(iso: string | null): string | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return null;
  return new Date(ms).toLocaleString("en-US", {
    timeZone: "America/New_York",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function Change({
  label,
  value,
}: {
  label: string;
  value: number | null;
}) {
  const up = value != null && value > 0;
  const down = value != null && value < 0;
  return (
    <p className="font-mono text-[11px] tracking-[0.08em] uppercase text-slate">
      {label}{" "}
      <span
        className={
          up ? "text-emerald-800" : down ? "text-rose-800" : "text-charcoal/60"
        }
      >
        {formatPctChange(value)}
      </span>
    </p>
  );
}

function SeriesCard({
  meta,
  data,
}: {
  meta: ExistingHomesSeriesMeta;
  data: ExistingHomesSeriesData;
}) {
  const latest = data.latest;
  const mom = latest && data.priorMonth
    ? pctChange(latest.value, data.priorMonth.value)
    : null;
  const yoy = latest && data.yearAgo
    ? pctChange(latest.value, data.yearAgo.value)
    : null;

  return (
    <article className={card}>
      <p className="font-mono text-[10px] tracking-[0.16em] uppercase text-slate">
        {meta.source}
      </p>
      <h3 className="font-serif text-2xl text-navy">{meta.label}</h3>
      <p className="font-serif text-3xl text-charcoal">
        {latest ? formatExistingHomesValue(latest.value, meta.unit) : "—"}
      </p>
      <p className="font-mono text-[11px] tracking-[0.1em] uppercase text-slate">
        {latest ? formatObsMonth(latest.date) : "No observation yet"}
        {meta.unit === "units-saar" ? " · SAAR" : null}
      </p>
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        <Change label="MoM" value={mom} />
        <Change label="YoY" value={yoy} />
      </div>
      <p className={`${body} text-sm`}>{meta.description}</p>
      <a
        href={fredHousingSeriesUrl(meta.id)}
        target="_blank"
        rel="noreferrer"
        className="inline-block font-mono text-[10px] tracking-[0.12em] uppercase text-navy underline decoration-navy/30 underline-offset-2 hover:decoration-navy"
      >
        {meta.id} on FRED
      </a>
    </article>
  );
}

function PendingCard({ snap }: { snap: NarPendingSnapshot | null }) {
  return (
    <article className={`${card} border-gold/30 bg-gold/[0.05]`}>
      <div className="flex flex-wrap items-center gap-2">
        <p className="font-mono text-[10px] tracking-[0.16em] uppercase text-slate">
          Source: NAR — not on FRED
        </p>
        <span className="rounded-full border border-gold/40 bg-gold/15 px-2 py-0.5 font-mono text-[10px] font-bold tracking-[0.12em] uppercase text-navy">
          Pending
        </span>
      </div>
      <h3 className="font-serif text-2xl text-navy">
        Pending Home Sales Index
      </h3>
      <p className="font-serif text-3xl text-charcoal">
        {snap?.index != null ? snap.index.toFixed(1) : "—"}
      </p>
      <p className="font-mono text-[11px] tracking-[0.1em] uppercase text-slate">
        {snap?.asOfLabel ?? "Latest NAR print"}
      </p>
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        <Change label="MoM" value={snap?.momPct ?? null} />
        <Change label="YoY" value={snap?.yoyPct ?? null} />
      </div>
      {snap?.northeastIndex != null ? (
        <p className={body}>
          Northeast index:{" "}
          <span className="text-charcoal">{snap.northeastIndex.toFixed(1)}</span>
        </p>
      ) : null}
      <p className={`${body} text-sm`}>
        Signed contracts on existing homes — leads closings by about one to two
        months. Official NAR Pending Home Sales, not the Realtor.com pending
        series on FRED.
      </p>
      {snap?.nextRelease ? (
        <p className="font-mono text-[11px] tracking-[0.08em] uppercase text-slate">
          Next release {snap.nextRelease}
        </p>
      ) : null}
      {snap && !snap.parseOk ? (
        <p className="text-sm text-charcoal/65">
          Latest index is not cached yet
          {snap.error ? ` (${snap.error})` : ""}. Use the NAR page for the
          current print.
        </p>
      ) : null}
      <a
        href={NAR_PENDING_HOME_SALES_URL}
        target="_blank"
        rel="noreferrer"
        className="inline-block font-mono text-[10px] tracking-[0.12em] uppercase text-navy underline decoration-navy/30 underline-offset-2 hover:decoration-navy"
      >
        NAR pending home sales
      </a>
    </article>
  );
}

function recentMonths(
  series: Record<ExistingHomesSeriesId, ExistingHomesSeriesData>,
  count = 12,
): string[] {
  const sales = series.EXHOSLUSM495S.observations;
  return sales.slice(-count).map((obs) => obs.date).reverse();
}

function valueOn(
  data: ExistingHomesSeriesData,
  date: string,
): number | null {
  const hit = data.observations.find((obs) => obs.date === date);
  return hit ? hit.value : null;
}

export default async function TrendsPage() {
  await ensureExistingHomesFresh();

  const [series, pending, meta] = await Promise.all([
    readExistingHomesSeries(),
    readNarPendingSnapshot(),
    readNarHousingSyncMeta(),
  ]);

  const updatedLabel = formatUpdatedAt(meta.lastSyncedAt);
  const months = recentMonths(series);
  const noFred = !isFredConfigured();
  const noData = EXISTING_HOMES_US_SERIES.every(
    (row) => !series[row.id].latest,
  );

  return (
    <>
      <section className="navy-gradient relative overflow-hidden pt-20 pb-0 text-white lg:pt-28">
        <div className="absolute inset-0 hero-grid opacity-40" aria-hidden />
        <div className="relative mx-auto max-w-7xl px-6 lg:px-10">
          <p className={`${eyebrow} mb-3 animate-fade-up`}>Markets</p>
          <h1 className="max-w-3xl font-serif text-4xl leading-[1.05] text-white sm:text-5xl lg:text-6xl animate-fade-up">
            <span className="italic gold-shimmer">Trends.</span>
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-white/70 lg:text-base animate-fade-up-delay-1">
            Official NAR existing-home sales, inventory, supply, and prices —
            pulled from FRED. Pending home sales come straight from NAR (that
            index is not on FRED). Same Markets bar as mortgage rates and Fed
            analysis.
          </p>
          <div className="mt-4 space-y-1.5 animate-fade-up-delay-2">
            <p className="flex flex-wrap gap-x-4 gap-y-2">
              <a
                href={NAR_EXISTING_HOME_SALES_URL}
                target="_blank"
                rel="noreferrer"
                className="font-mono text-[11px] tracking-[0.12em] uppercase text-gold underline decoration-gold/40 underline-offset-2 hover:decoration-gold"
              >
                NAR existing-home sales
              </a>
              <a
                href={NAR_PENDING_HOME_SALES_URL}
                target="_blank"
                rel="noreferrer"
                className="font-mono text-[11px] tracking-[0.12em] uppercase text-gold underline decoration-gold/40 underline-offset-2 hover:decoration-gold"
              >
                NAR pending home sales
              </a>
              <a
                href={FRED_NAR_RELEASE_URL}
                target="_blank"
                rel="noreferrer"
                className="font-mono text-[11px] tracking-[0.12em] uppercase text-gold underline decoration-gold/40 underline-offset-2 hover:decoration-gold"
              >
                FRED NAR release
              </a>
            </p>
            <p className="font-mono text-[10px] tracking-[0.1em] uppercase text-white/45">
              {updatedLabel
                ? `FRED series last updated ${updatedLabel} ET`
                : noFred
                  ? "FRED_API_KEY is not set"
                  : "FRED series not synced yet"}
            </p>
          </div>
          <MarketsPageTabs active="trends" />
        </div>
      </section>

      <section className="bg-cream py-10 lg:py-16">
        <div className="mx-auto max-w-6xl space-y-12 px-6 lg:px-10">
          {noData ? (
            <p className={body}>
              National NAR series will appear here after the first FRED pull.
              Pending home sales still come from NAR below.
            </p>
          ) : null}

          <div>
            <p className={sectionLabel}>United States — NAR via FRED</p>
            <div className="grid gap-5 md:grid-cols-2">
              {EXISTING_HOMES_US_SERIES.map((meta) => (
                <SeriesCard
                  key={meta.id}
                  meta={meta}
                  data={series[meta.id]}
                />
              ))}
            </div>
          </div>

          <div>
            <p className={sectionLabel}>Northeast census region — same report</p>
            <div className="grid gap-5 md:grid-cols-2">
              {EXISTING_HOMES_NORTHEAST_SERIES.map((meta) => (
                <SeriesCard
                  key={meta.id}
                  meta={meta}
                  data={series[meta.id]}
                />
              ))}
            </div>
          </div>

          <div>
            <p className={sectionLabel}>Pending home sales — NAR only</p>
            <PendingCard snap={pending} />
          </div>

          {months.length > 0 ? (
            <div>
              <p className={sectionLabel}>Recent U.S. months</p>
              <div className="overflow-x-auto rounded-2xl border border-charcoal/[0.08] bg-white">
                <table className="min-w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-charcoal/10 font-mono text-[10px] uppercase tracking-[0.12em] text-slate">
                      <th className="px-4 py-3 font-medium">Month</th>
                      {EXISTING_HOMES_US_SERIES.map((meta) => (
                        <th key={meta.id} className="px-4 py-3 font-medium">
                          {meta.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {months.map((date) => (
                      <tr
                        key={date}
                        className="border-b border-charcoal/[0.06] last:border-0"
                      >
                        <td className="px-4 py-3 font-mono text-[12px] text-slate">
                          {formatObsMonthShort(date)}
                        </td>
                        {EXISTING_HOMES_US_SERIES.map((meta) => {
                          const value = valueOn(series[meta.id], date);
                          return (
                            <td key={meta.id} className="px-4 py-3 text-charcoal">
                              {value == null
                                ? "—"
                                : formatExistingHomesValue(value, meta.unit)}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}

          <p className="text-xs leading-relaxed text-slate">
            Existing-home sales, inventory, months of supply, and median prices
            are National Association of Realtors series republished on FRED (
            {EXISTING_HOMES_US_SERIES.map((row) => row.id).join(", ")}; Northeast{" "}
            {EXISTING_HOMES_NORTHEAST_SERIES.map((row) => row.id).join(", ")}
            ). Pending Home Sales Index is published only by NAR — see{" "}
            <a
              href={NAR_PENDING_HOME_SALES_URL}
              target="_blank"
              rel="noreferrer"
              className="text-navy underline underline-offset-2"
            >
              nar.realtor pending home sales
            </a>
            . These are national / census-region prints, not Fairfield County
            MLS counts. Local inventory lives on Market Pulse.
          </p>
        </div>
      </section>
    </>
  );
}
