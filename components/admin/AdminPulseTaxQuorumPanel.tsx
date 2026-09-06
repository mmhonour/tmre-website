import { formatAdminSyncTimestamp } from "@/lib/admin-sync-schedule-format";
import { adminSectionHref } from "@/lib/admin-nav";
import {
  formatPulseTaxComparedLabel,
  formatPulseTaxCoveragePct,
  formatTaxYearLabel,
  PULSE_TAX_YEAR_QUORUM,
} from "@/lib/listing-property-tax";
import type { PulseTaxQuorumAdmin } from "@/lib/market-pulse-tax-cache";

function coverageLine(
  label: string,
  yearEnd: number,
  have: number,
  universe: number,
  pct: number,
  quorum: number,
) {
  const reached = universe > 0 && pct >= quorum;
  return (
    <li className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-2">
      <div>
        <p className="font-mono text-[11px] tracking-[0.12em] uppercase text-navy">
          {label}
        </p>
        <p className="mt-0.5 text-sm text-charcoal/65">
          {formatTaxYearLabel(yearEnd)}
        </p>
      </div>
      <p className="font-mono text-sm tabular-nums text-navy">
        {formatPulseTaxCoveragePct(pct)}
        <span className="ml-2 text-[11px] text-charcoal/50">
          {have.toLocaleString()} / {universe.toLocaleString()}
          {reached ? " · quorum" : ` · need ${Math.round(quorum * 100)}%`}
        </span>
      </p>
    </li>
  );
}

export default function AdminPulseTaxQuorumPanel({
  snapshot,
}: {
  snapshot: PulseTaxQuorumAdmin | null;
}) {
  if (!snapshot) {
    return (
      <p className="text-sm text-charcoal/65">
        Coverage is unavailable until listings and CAMA history can be read.
      </p>
    );
  }

  const { live, cached } = snapshot;
  const published = cached.ready
    ? `Market Pulse is showing ${cached.taxYearLabel}.`
    : "Market Pulse tax bars are off.";
  const nextStep = !live.camaHasRun
    ? "Waiting on the first Property tax history (CAMA) run."
    : !live.ready
      ? "CAMA has run, but the chosen year is still below the 80% tipping point."
      : !cached.ready
        ? "Quorum is in. Run Stats cache to publish the bars."
        : live.kind !== cached.yearKind
          ? `Live coverage is ${live.kind}. Rebuild Stats cache to switch Pulse from ${cached.yearKind}.`
          : "Cache matches live coverage.";

  return (
    <div className="px-5 sm:px-6 pb-5 space-y-4">
      <p className="text-sm text-charcoal/65 max-w-3xl leading-relaxed">
        Tipping point for the sale book (every listing, any status). Current
        year flips only when {Math.round(PULSE_TAX_YEAR_QUORUM * 100)}% of
        those listings have that bill — a few new MLS rows must not move the
        comparison. This lives on Syncs, next to CAMA and the stats rebuild,
        not under Data Controls.
      </p>
      <ul className="divide-y divide-charcoal/[0.08]">
        {coverageLine(
          "Current fiscal year",
          live.currentYearEnd,
          live.countCurrent,
          live.listingUniverse,
          live.pctCurrent,
          live.quorumPct,
        )}
        {coverageLine(
          "Prior fiscal year",
          live.priorYearEnd,
          live.countPrior,
          live.listingUniverse,
          live.pctPrior,
          live.quorumPct,
        )}
      </ul>
      <dl className="grid gap-3 sm:grid-cols-2 text-sm">
        <div>
          <dt className="font-mono text-[10px] tracking-[0.12em] uppercase text-charcoal/45">
            Live pick
          </dt>
          <dd className="mt-0.5 font-mono text-navy">
            {formatPulseTaxComparedLabel(live.yearEnd, live.kind)}
          </dd>
        </div>
        <div>
          <dt className="font-mono text-[10px] tracking-[0.12em] uppercase text-charcoal/45">
            CAMA last finished
          </dt>
          <dd className="mt-0.5 font-mono text-navy">
            {live.camaSyncedAt
              ? formatAdminSyncTimestamp(live.camaSyncedAt)
              : "Never"}
          </dd>
        </div>
      </dl>
      <p className="text-sm text-navy leading-relaxed">{published}</p>
      <p className="text-sm text-charcoal/65 leading-relaxed">{nextStep}</p>
      <p className="font-mono text-[11px] tracking-[0.08em] uppercase">
        <a
          href={adminSectionHref("admin-sync-configure", "syncs")}
          className="text-navy/70 hover:text-navy underline-offset-2 hover:underline"
        >
          Syncs → Configure
        </a>
      </p>
    </div>
  );
}
