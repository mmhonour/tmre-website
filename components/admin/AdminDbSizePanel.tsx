"use client";

import { useState } from "react";
import type { DbSizeReport } from "@/lib/db-size-report-shared";
import { formatUsd } from "@/lib/db-size-report-shared";

const TH =
  "px-3 py-2 font-mono text-[10px] tracking-[0.12em] uppercase text-charcoal/50 border-b border-r border-charcoal/[0.08] whitespace-nowrap";
const TD =
  "px-3 py-2.5 font-mono text-[11px] text-navy border-b border-r border-charcoal/[0.06] tabular-nums";

function formatCount(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return Math.round(n).toLocaleString("en-US");
}

export default function AdminDbSizePanel() {
  const [report, setReport] = useState<DbSizeReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  async function runReport() {
    setRunning(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/db-size", { cache: "no-store" });
      const body = (await res.json()) as DbSizeReport & { error?: string };
      if (!res.ok) {
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      setReport(body);
    } catch (err) {
      setReport(null);
      setError(err instanceof Error ? err.message : "Failed to run report");
    } finally {
      setRunning(false);
    }
  }

  return (
    <div
      id="admin-db-size"
      className="scroll-mt-24 overflow-hidden rounded-2xl border border-charcoal/[0.08] bg-white shadow-sm shadow-charcoal/[0.04]"
    >
      <div className="border-b border-charcoal/[0.08] bg-cream/40 px-5 py-4 sm:px-6">
        <p className="font-mono text-[11px] tracking-[0.2em] uppercase text-gold">
          Size & growth
        </p>
        <p className="mt-1 text-sm text-charcoal/65">
          How big Neon is, how fast tables are growing, and which queries keep
          compute awake. Storage is cheap; an always-on compute is the usual
          bill. Same numbers as{" "}
          <span className="font-mono text-[11px] text-navy">npm run db:size</span>
          .
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => void runReport()}
            disabled={running}
            className="rounded-full border border-navy/30 bg-cream/40 px-4 py-2 font-mono text-[10px] tracking-[0.12em] uppercase text-navy transition-colors hover:bg-cream disabled:opacity-40"
          >
            {running ? "Running…" : report ? "Run again" : "Run report"}
          </button>
          {report ? (
            <p className="font-mono text-[10px] tracking-[0.12em] uppercase text-charcoal/40">
              {report.database} · {new Date(report.fetchedAt).toLocaleString()}
            </p>
          ) : (
            <p className="font-mono text-[10px] text-charcoal/45">
              Not run this session — scans birth timestamps on the largest tables
            </p>
          )}
        </div>
      </div>

      {error ? (
        <p className="px-5 py-4 text-sm text-coral sm:px-6">{error}</p>
      ) : null}

      {report ? <ReportBody report={report} /> : null}
    </div>
  );
}

function ReportBody({ report }: { report: DbSizeReport }) {
  return (
    <div className="space-y-8 px-5 py-5 sm:px-6">
      <p className="text-sm text-charcoal/70">
        Database total{" "}
        <span className="font-mono text-navy">{report.totalLabel}</span>
        {" · "}
        storage {report.storageMonthlyLabel}/mo at $0.35/GB
      </p>

      <section>
        <h3 className="font-mono text-[10px] tracking-[0.16em] uppercase text-gold">
          Size by table
        </h3>
        <div className="mt-3 overflow-x-auto">
          <table className="border-collapse text-left w-max min-w-full">
            <thead>
              <tr>
                <th className={TH}>Table</th>
                <th className={`${TH} text-right`}>Rows</th>
                <th className={`${TH} text-right`}>Total</th>
                <th className={`${TH} text-right`}>Heap</th>
                <th className={`${TH} text-right`}>Toast</th>
                <th className={`${TH} text-right`}>Indexes</th>
              </tr>
            </thead>
            <tbody>
              {report.tables.map((row) => (
                <tr key={row.table}>
                  <td className={TD}>{row.table}</td>
                  <td className={`${TD} text-right`}>{formatCount(row.rows)}</td>
                  <td className={`${TD} text-right`}>{row.totalLabel}</td>
                  <td className={`${TD} text-right`}>{row.heapLabel}</td>
                  <td className={`${TD} text-right`}>{row.toastLabel}</td>
                  <td className={`${TD} text-right`}>{row.indexLabel}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h3 className="font-mono text-[10px] tracking-[0.16em] uppercase text-gold">
          MLS inventory
        </h3>
        {report.listings ? (
          <div className="mt-3 space-y-1 text-sm text-charcoal/70">
            <p>
              Rows {formatCount(report.listings.total)} · Active{" "}
              {formatCount(report.listings.active)} · Closed{" "}
              {formatCount(report.listings.closed)}
            </p>
            <p>
              Newly listed 24h {formatCount(report.listings.listed1d)} · 7d{" "}
              {formatCount(report.listings.listed7d)} · 30d{" "}
              {formatCount(report.listings.listed30d)} (~
              {formatCount(report.listings.listedPerDay)}/day)
            </p>
            <p>
              Newly closed 24h {formatCount(report.listings.closed1d)} · 7d{" "}
              {formatCount(report.listings.closed7d)} · 30d{" "}
              {formatCount(report.listings.closed30d)} (~
              {formatCount(report.listings.closedPerDay)}/day)
            </p>
            <p className="text-xs text-charcoal/50">
              Listings upsert in place, so the table grows by unique MLS ids
              (mostly new closings that stay on file), not by every incremental
              pull.
            </p>
          </div>
        ) : (
          <p className="mt-3 text-sm text-charcoal/55">
            listings table is not present.
          </p>
        )}
      </section>

      <section>
        <h3 className="font-mono text-[10px] tracking-[0.16em] uppercase text-gold">
          Growth
        </h3>
        {report.growth.length === 0 ? (
          <p className="mt-3 text-sm text-charcoal/55">
            No table exposes a creation timestamp — nothing to measure.
          </p>
        ) : (
          <>
            <div className="mt-3 overflow-x-auto">
              <table className="border-collapse text-left w-max min-w-full">
                <thead>
                  <tr>
                    <th className={TH}>Table</th>
                    <th className={TH}>Column</th>
                    <th className={`${TH} text-right`}>24h</th>
                    <th className={`${TH} text-right`}>7d</th>
                    <th className={`${TH} text-right`}>30d</th>
                    <th className={`${TH} text-right`}>Per day</th>
                    <th className={`${TH} text-right`}>Bytes/day</th>
                  </tr>
                </thead>
                <tbody>
                  {report.growth.map((row) => (
                    <tr key={`${row.table}.${row.column}`}>
                      <td className={TD}>{row.table}</td>
                      <td className={TD}>{row.column}</td>
                      <td className={`${TD} text-right`}>{formatCount(row.d1)}</td>
                      <td className={`${TD} text-right`}>{formatCount(row.d7)}</td>
                      <td className={`${TD} text-right`}>{formatCount(row.d30)}</td>
                      <td className={`${TD} text-right`}>
                        {formatCount(row.perDay)}
                      </td>
                      <td className={`${TD} text-right`}>{row.bytesPerDayLabel}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-sm text-charcoal/70">
              Total growth {report.growthBytesPerDayLabel}/day ·{" "}
              {report.growthBytesPerMonthLabel}/month ·{" "}
              {report.growthGbPerYear.toFixed(2)} GB/year (+
              {formatUsd(report.growthStorageAfterYearUsd)}/mo of storage after a
              year)
            </p>
            <p className="mt-1 text-xs text-charcoal/50">
              Bytes/day is rows/day scaled by that table&apos;s current
              bytes-per-row. A wide jsonb row costs far more than a counter.
            </p>
            {report.sparseNotes.length > 0 ? (
              <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-charcoal/50">
                {report.sparseNotes.map((note) => (
                  <li key={note}>{note} — rate is a floor, not a measurement</li>
                ))}
              </ul>
            ) : null}
          </>
        )}
      </section>

      <section>
        <h3 className="font-mono text-[10px] tracking-[0.16em] uppercase text-gold">
          What keeps compute awake
        </h3>
        {report.chatterUnavailable || !report.chatter ? (
          <p className="mt-3 text-sm text-charcoal/55">
            pg_stat_statements is not enabled.{" "}
            <span className="font-mono text-[11px]">
              CREATE EXTENSION IF NOT EXISTS pg_stat_statements;
            </span>
          </p>
        ) : (
          <div className="mt-3 space-y-3">
            <p className="text-sm text-charcoal/70">
              Compute has been awake {report.chatter.hoursAwake.toFixed(1)}h
              since it last started. Neon suspends after 5 idle minutes, so a
              query running more often than that is what pays for awake hours.
            </p>
            {!report.chatter.canExtrapolate ? (
              <p className="text-xs text-charcoal/50">
                Window is under an hour, so per-day rates are withheld.
              </p>
            ) : null}
            <div className="overflow-x-auto">
              <table className="border-collapse text-left w-max min-w-full">
                <thead>
                  <tr>
                    <th className={`${TH} text-right`}>Calls</th>
                    <th className={`${TH} text-right`}>Calls/day</th>
                    <th className={`${TH} text-right`}>Every</th>
                    <th className={TH}>Query</th>
                  </tr>
                </thead>
                <tbody>
                  {report.chatter.rows.map((row, idx) => (
                    <tr key={`${row.query}-${idx}`}>
                      <td className={`${TD} text-right`}>
                        {formatCount(row.calls)}
                      </td>
                      <td className={`${TD} text-right`}>
                        {formatCount(row.callsPerDay)}
                      </td>
                      <td className={`${TD} text-right`}>{row.everyLabel}</td>
                      <td className={`${TD} max-w-[36rem] whitespace-normal`}>
                        {row.query}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-charcoal/50">
              An always-awake compute bills all 730 hours in a month:
            </p>
            <ul className="space-y-1 font-mono text-[11px] text-navy">
              {report.chatter.alwaysOn.map((cost) => (
                <li key={cost.cu}>
                  {cost.cu} CU → {formatUsd(cost.launchUsd)}/mo Launch ·{" "}
                  {formatUsd(cost.scaleUsd)}/mo Scale
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>
    </div>
  );
}
