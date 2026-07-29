import Link from "next/link";
import { fmtMoney } from "@/lib/listing-history";
import type { MarketDigestSnapshot } from "@/lib/market-digest-types";
import type { MonthsSupplyPayload } from "@/lib/months-supply-types";
import { splitSentences } from "@/lib/split-sentences";

function fmtMos(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "n/a";
  return `${n.toFixed(1)} mo`;
}

function fmtActive(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return String(Math.round(n));
}

function cityLabel(row: MonthsSupplyPayload): string {
  const city = row.city?.trim() || "—";
  if (city.toLowerCase() === "all") return "All towns";
  return city;
}

function chartRows(snapshot: MarketDigestSnapshot): MonthsSupplyPayload[] {
  const rows: MonthsSupplyPayload[] = [];
  if (snapshot.market) rows.push(snapshot.market);
  for (const town of snapshot.towns) {
    if (
      snapshot.market &&
      town.city.trim().toLowerCase() === snapshot.market.city.trim().toLowerCase()
    ) {
      continue;
    }
    rows.push(town);
  }
  return rows;
}

function BarChart({
  title,
  rows,
  valueOf,
  formatValue,
  barClassName,
  emptyMessage,
}: {
  title: string;
  rows: MonthsSupplyPayload[];
  valueOf: (row: MonthsSupplyPayload) => number | null;
  formatValue: (row: MonthsSupplyPayload) => string;
  barClassName: string;
  emptyMessage: string;
}) {
  if (rows.length === 0) {
    return (
      <section>
        <p className="font-mono text-[11px] tracking-[0.16em] uppercase text-gold mb-3">
          {title}
        </p>
        <p className="font-serif text-sm text-slate">{emptyMessage}</p>
      </section>
    );
  }

  const max = Math.max(
    0,
    ...rows.map((r) => {
      const v = valueOf(r);
      return v != null && Number.isFinite(v) ? v : 0;
    }),
  );

  return (
    <section>
      <p className="font-mono text-[11px] tracking-[0.16em] uppercase text-gold mb-4">
        {title}
      </p>
      <ul className="space-y-2.5">
        {rows.map((row) => {
          const v = valueOf(row);
          const pct =
            max > 0 && v != null && Number.isFinite(v) ? (v / max) * 100 : 0;
          return (
            <li
              key={`${row.city}-${title}`}
              className="grid grid-cols-[7.5rem_1fr_3.5rem] items-center gap-2"
            >
              <span className="font-serif text-sm text-navy truncate">
                {cityLabel(row)}
              </span>
              <div className="h-3.5 rounded-sm bg-[#E8EBF2] overflow-hidden">
                <div
                  className={`h-full rounded-sm ${barClassName}`}
                  style={{ width: `${Math.max(0, Math.min(100, pct))}%` }}
                />
              </div>
              <span className="font-mono text-xs text-navy text-right tabular-nums">
                {formatValue(row)}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-charcoal/[0.08] bg-cream px-3 py-4 text-center">
      <p className="font-mono text-[10px] tracking-[0.14em] uppercase text-slate mb-1.5">
        {label}
      </p>
      <p className="font-serif text-2xl text-navy leading-tight">{value}</p>
    </div>
  );
}

/**
 * Web presentation of the Monday market brief snapshot (Market Pulse).
 * Same data as the email; refine layout here over time.
 */
export default function WeeklyBriefContent({
  snapshot,
  etDate,
  eyebrow = "TMRE Market Pulse",
  scopeLabel = "sales",
  showDealOfTheWeek = true,
}: {
  snapshot: MarketDigestSnapshot;
  etDate: string;
  eyebrow?: string;
  /** Chart / footnote scope for the active category tab. */
  scopeLabel?: string;
  showDealOfTheWeek?: boolean;
}) {
  const rows = chartRows(snapshot);
  const deal = showDealOfTheWeek ? snapshot.dealOfTheWeek : null;
  const social = snapshot.socialProfiles.filter((p) => p.handleOrUrl);

  return (
    <article className="mx-auto max-w-2xl">
      <header className="rounded-t-2xl bg-navy px-6 py-7 sm:px-8">
        <p className="font-mono text-[11px] tracking-[0.2em] uppercase text-gold mb-2">
          {eyebrow}
        </p>
        <h1 className="font-serif text-2xl sm:text-3xl text-white leading-snug">
          {etDate}
        </h1>
        <p className="mt-3 font-mono text-[11px]">
          <Link href="/stats" className="text-gold underline underline-offset-2">
            View live stats
          </Link>
        </p>
      </header>

      <div className="rounded-b-2xl border border-t-0 border-charcoal/[0.08] bg-white px-6 py-7 sm:px-8 space-y-8 shadow-sm shadow-navy/5">
        <div className="grid grid-cols-3 gap-2 sm:gap-3">
          <Kpi
            label="Market active"
            value={snapshot.market ? fmtActive(snapshot.market.activeCount) : "—"}
          />
          <Kpi
            label="Market MOS"
            value={
              snapshot.market ? fmtMos(snapshot.market.monthsSupply) : "—"
            }
          />
          <Kpi
            label="Westport MOS"
            value={
              snapshot.westport ? fmtMos(snapshot.westport.monthsSupply) : "—"
            }
          />
        </div>

        <BarChart
          title={`Active inventory (${scopeLabel})`}
          rows={rows}
          valueOf={(r) => r.activeCount}
          formatValue={(r) => fmtActive(r.activeCount)}
          barClassName="bg-[#2A3D6B]"
          emptyMessage="No inventory rows in cache yet."
        />

        <BarChart
          title={`Months supply (${scopeLabel})`}
          rows={rows}
          valueOf={(r) => r.monthsSupply}
          formatValue={(r) => fmtMos(r.monthsSupply)}
          barClassName="bg-gold"
          emptyMessage="No months-supply rows in cache yet."
        />

        {deal ? (
          <section className="rounded-xl bg-[#131F38] overflow-hidden">
            <div className="px-5 pt-5 pb-3 sm:px-6">
              <p className="font-mono text-[11px] tracking-[0.18em] uppercase text-gold mb-1">
                Deal of the Week
              </p>
              <p className="font-serif text-3xl sm:text-4xl leading-tight text-white">
                <span className="italic text-gold">
                  {deal.composite != null && Number.isFinite(deal.composite)
                    ? deal.composite.toFixed(1)
                    : "—"}
                </span>
                <span className="italic text-white/85"> · One listing.</span>
              </p>
            </div>
            {deal.photoUrl ? (
              // Plain img: MLS CDNs are not in next/image remotePatterns.
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={deal.photoUrl}
                alt={deal.address}
                className="block w-full aspect-[16/10] object-cover bg-navy"
              />
            ) : (
              <div className="px-5 py-12 text-center font-serif text-sm text-white/55">
                No photo available
              </div>
            )}
            <div className="px-5 py-5 sm:px-6 space-y-3">
              <p className="font-serif text-xl text-white leading-snug">
                {deal.address}
                {deal.city ? `, ${deal.city}` : ""}
              </p>
              <p className="font-mono text-sm text-white/85">
                {deal.price != null ? fmtMoney(deal.price) : "—"}
                <span className="text-white/40"> · </span>
                MLS #{deal.mlsId}
              </p>
              {(() => {
                const meta = [
                  deal.propertyType,
                  deal.beds != null && deal.baths != null
                    ? `${deal.beds}BR/${deal.baths}BA`
                    : null,
                  deal.sqft != null
                    ? `${deal.sqft.toLocaleString()} sqft`
                    : null,
                  deal.lotAcres != null && Number.isFinite(deal.lotAcres)
                    ? `${deal.lotAcres.toFixed(deal.lotAcres < 1 ? 2 : 1)} ac`
                    : null,
                  deal.yearBuilt != null ? `Built ${deal.yearBuilt}` : null,
                ]
                  .filter(Boolean)
                  .join(" · ");
                return meta ? (
                  <p className="font-mono text-[11px] text-white/60">{meta}</p>
                ) : null;
              })()}
              {deal.valueDiscountPct != null &&
              Number.isFinite(deal.valueDiscountPct) &&
              deal.valueDiscountPct > 0 ? (
                <p className="font-mono text-[11px] tracking-[0.08em] uppercase text-gold">
                  {Math.round(deal.valueDiscountPct)}% below town median
                </p>
              ) : null}
              {deal.superlatives.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {deal.superlatives.slice(0, 5).map((word) => (
                    <span
                      key={word}
                      className="inline-block rounded-full border border-gold/45 px-2.5 py-1 font-mono text-[10px] tracking-[0.12em] uppercase text-gold"
                    >
                      {word}
                    </span>
                  ))}
                </div>
              ) : null}
              {splitSentences(deal.insight).length > 0 ? (
                splitSentences(deal.insight).map((sentence) => (
                  <p
                    key={sentence}
                    className="font-serif text-sm leading-relaxed text-white/80"
                  >
                    {sentence}
                  </p>
                ))
              ) : (
                <p className="font-serif text-sm text-white/65">
                  No insight available.
                </p>
              )}
              <p className="pt-2">
                <a
                  href={deal.href}
                  className="inline-block rounded-full bg-gold px-4 py-2.5 font-mono text-[11px] tracking-[0.14em] uppercase text-[#131F38] hover:bg-gold/90 transition-colors"
                >
                  View listing
                </a>
              </p>
            </div>
          </section>
        ) : showDealOfTheWeek ? (
          <section>
            <p className="font-mono text-[11px] tracking-[0.16em] uppercase text-gold mb-2">
              Deal of the Week
            </p>
            <p className="font-serif text-sm text-slate">
              No Deal of the Week in cache yet — check homepage / stats rebuild.
            </p>
          </section>
        ) : null}

        <p className="font-mono text-[11px] leading-relaxed text-slate">
          MOS = active ÷ avg monthly closings (3 prior full months). Scope:{" "}
          {scopeLabel}.
        </p>

        <section>
          <p className="font-mono text-[11px] tracking-[0.16em] uppercase text-gold mb-3">
            Social profiles
          </p>
          {social.length === 0 ? (
            <p className="font-serif text-sm text-slate">
              No social handles saved yet.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {social.map((p) => (
                <li key={p.label} className="font-mono text-xs text-navy">
                  {p.label}: {p.handleOrUrl}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </article>
  );
}
