"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type {
  DbSizeGrowthRow,
  DbSizeListingsTown,
  DbSizeReport,
  DbSizeTable,
} from "@/lib/db-size-report-shared";
import { formatSignedCount, formatUsd } from "@/lib/db-size-report-shared";
import { tablePurposeFor } from "@/lib/db-size-table-glossary";

const TH =
  "px-3 py-2 font-mono text-[10px] tracking-[0.12em] uppercase text-charcoal/50 border-b border-r border-charcoal/[0.08] whitespace-nowrap";
const TD =
  "px-3 py-2.5 font-mono text-[11px] text-navy border-b border-r border-charcoal/[0.06] tabular-nums";
const TF =
  "px-3 py-2.5 font-mono text-[11px] font-semibold text-navy border-t-2 border-charcoal/20 border-r border-charcoal/[0.06] tabular-nums bg-cream/70";

function formatCount(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return Math.round(n).toLocaleString("en-US");
}

function signedClass(n: number): string {
  if (n > 0) return "text-navy";
  if (n < 0) return "text-coral";
  return "text-charcoal/50";
}

type SortDir = "asc" | "desc";

function SortHeader({
  label,
  active,
  dir,
  align,
  onClick,
}: {
  label: string;
  active: boolean;
  dir: SortDir;
  align?: "left" | "right";
  onClick: () => void;
}) {
  return (
    <th className={`${TH} ${align === "right" ? "text-right" : ""}`}>
      <button
        type="button"
        onClick={onClick}
        className={`inline-flex items-center gap-1 hover:text-navy ${
          active ? "text-navy" : ""
        } ${align === "right" ? "ml-auto" : ""}`}
      >
        {label}
        <span className="tabular-nums text-[8px] opacity-70">
          {active ? (dir === "desc" ? "↓" : "↑") : "↕"}
        </span>
      </button>
    </th>
  );
}

function compareValues(
  a: string | number | null | undefined,
  b: string | number | null | undefined,
  dir: SortDir,
): number {
  const empty = dir === "asc" ? 1 : -1;
  if (a == null && b == null) return 0;
  if (a == null) return empty;
  if (b == null) return -empty;
  if (typeof a === "number" && typeof b === "number") {
    return dir === "asc" ? a - b : b - a;
  }
  const cmp = String(a).localeCompare(String(b), undefined, {
    numeric: true,
    sensitivity: "base",
  });
  return dir === "asc" ? cmp : -cmp;
}

function TablePurposeName({
  name,
  purpose,
}: {
  name: string;
  purpose: string;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(ev: MouseEvent) {
      if (!wrapRef.current?.contains(ev.target as Node)) setOpen(false);
    }
    function onKey(ev: KeyboardEvent) {
      if (ev.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <span ref={wrapRef} className="relative inline-block max-w-[18rem]">
      <button
        type="button"
        title={purpose}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((v) => !v)}
        className="text-left underline decoration-dotted decoration-charcoal/35 underline-offset-2 hover:text-gold"
      >
        {name}
      </button>
      {open ? (
        <span
          role="dialog"
          aria-label={`${name} purpose`}
          className="absolute left-0 top-full z-30 mt-1 w-72 rounded-lg border border-charcoal/15 bg-white px-3 py-2 text-left font-sans text-[12px] font-normal normal-case tracking-normal text-charcoal/80 shadow-lg shadow-charcoal/10"
        >
          {purpose}
        </span>
      ) : null}
    </span>
  );
}

export default function AdminDbSizePanel() {
  const [report, setReport] = useState<DbSizeReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [loading, setLoading] = useState(true);

  async function loadSnapshot() {
    setError(null);
    try {
      const res = await fetch("/api/admin/db-size", { cache: "no-store" });
      const body = (await res.json()) as {
        report?: DbSizeReport | null;
        error?: string;
      };
      if (!res.ok) {
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      setReport(body.report ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load size report");
    } finally {
      setLoading(false);
    }
  }

  async function runAgain() {
    setRunning(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/db-size", {
        method: "POST",
        cache: "no-store",
      });
      const body = (await res.json()) as {
        report?: DbSizeReport;
        error?: string;
      };
      if (!res.ok || !body.report) {
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      setReport(body.report);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to run report");
    } finally {
      setRunning(false);
    }
  }

  useEffect(() => {
    void loadSnapshot();
  }, []);

  const triggerLabel =
    report?.trigger === "schedule"
      ? "Daily 6:00 AM ET"
      : report?.trigger === "adhoc"
        ? "Ad-hoc"
        : null;

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
          compute awake. The daily sync job writes this page at 6:00 AM ET.
          Run again is an ad-hoc recompute of the same snapshot. Same numbers as{" "}
          <span className="font-mono text-[11px] text-navy">npm run db:size</span>
          .
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => void runAgain()}
            disabled={running || loading}
            className="rounded-full border border-navy/30 bg-cream/40 px-4 py-2 font-mono text-[10px] tracking-[0.12em] uppercase text-navy transition-colors hover:bg-cream disabled:opacity-40"
          >
            {running ? "Running…" : "Run again"}
          </button>
          {report ? (
            <p className="font-mono text-[10px] tracking-[0.12em] uppercase text-charcoal/40">
              {triggerLabel ? `${triggerLabel} · ` : ""}
              {report.database} · {new Date(report.fetchedAt).toLocaleString()}
            </p>
          ) : loading ? (
            <p className="font-mono text-[10px] text-charcoal/45">
              Loading last snapshot…
            </p>
          ) : (
            <p className="font-mono text-[10px] text-charcoal/45">
              No snapshot yet — the 6:00 AM ET job will populate this page, or
              Run again now
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

type SizeSortKey = "table" | "rows" | "total" | "heap" | "toast" | "indexes";
type GrowthSortKey =
  | "table"
  | "column"
  | "d1"
  | "d7"
  | "d30"
  | "perDay"
  | "bytesPerDay";
type ChatterSortKey = "calls" | "callsPerDay" | "everyLabel" | "query";
type TownSortKey =
  | "town"
  | "active"
  | "closed"
  | "listed1d"
  | "closed1d"
  | "listed7d"
  | "closed7d"
  | "listed30d"
  | "closed30d"
  | "net1d";

function ReportBody({ report }: { report: DbSizeReport }) {
  const [sizeSort, setSizeSort] = useState<{ key: SizeSortKey; dir: SortDir }>({
    key: "total",
    dir: "desc",
  });
  const [growthSort, setGrowthSort] = useState<{
    key: GrowthSortKey;
    dir: SortDir;
  }>({
    key: "bytesPerDay",
    dir: "desc",
  });
  const [chatterSort, setChatterSort] = useState<{
    key: ChatterSortKey;
    dir: SortDir;
  }>({
    key: "calls",
    dir: "desc",
  });
  const [townSort, setTownSort] = useState<{ key: TownSortKey; dir: SortDir }>({
    key: "listed1d",
    dir: "desc",
  });

  const tables = useMemo(() => {
    const rows = [...report.tables];
    rows.sort((a, b) =>
      compareValues(sizeValue(a, sizeSort.key), sizeValue(b, sizeSort.key), sizeSort.dir),
    );
    return rows;
  }, [report.tables, sizeSort]);

  const growth = useMemo(() => {
    const rows = [...report.growth];
    rows.sort((a, b) =>
      compareValues(
        growthValue(a, growthSort.key),
        growthValue(b, growthSort.key),
        growthSort.dir,
      ),
    );
    return rows;
  }, [report.growth, growthSort]);

  const chatterRows = useMemo(() => {
    const rows = [...(report.chatter?.rows ?? [])];
    rows.sort((a, b) =>
      compareValues(
        chatterSort.key === "calls"
          ? a.calls
          : chatterSort.key === "callsPerDay"
            ? a.callsPerDay
            : chatterSort.key === "everyLabel"
              ? a.everyLabel
              : a.query,
        chatterSort.key === "calls"
          ? b.calls
          : chatterSort.key === "callsPerDay"
            ? b.callsPerDay
            : chatterSort.key === "everyLabel"
              ? b.everyLabel
              : b.query,
        chatterSort.dir,
      ),
    );
    return rows;
  }, [report.chatter?.rows, chatterSort]);

  const towns = useMemo(() => {
    const rows = [...(report.listingsByTown ?? [])];
    rows.sort((a, b) =>
      compareValues(townValue(a, townSort.key), townValue(b, townSort.key), townSort.dir),
    );
    return rows;
  }, [report.listingsByTown, townSort]);

  function cycleSize(key: SizeSortKey) {
    setSizeSort((prev) =>
      prev.key === key
        ? { key, dir: prev.dir === "desc" ? "asc" : "desc" }
        : { key, dir: key === "table" ? "asc" : "desc" },
    );
  }

  function cycleGrowth(key: GrowthSortKey) {
    setGrowthSort((prev) =>
      prev.key === key
        ? { key, dir: prev.dir === "desc" ? "asc" : "desc" }
        : { key, dir: key === "table" || key === "column" ? "asc" : "desc" },
    );
  }

  function cycleChatter(key: ChatterSortKey) {
    setChatterSort((prev) =>
      prev.key === key
        ? { key, dir: prev.dir === "desc" ? "asc" : "desc" }
        : { key, dir: key === "query" || key === "everyLabel" ? "asc" : "desc" },
    );
  }

  function cycleTown(key: TownSortKey) {
    setTownSort((prev) =>
      prev.key === key
        ? { key, dir: prev.dir === "desc" ? "asc" : "desc" }
        : { key, dir: key === "town" ? "asc" : "desc" },
    );
  }

  const tableRollup = report.tableRollup;
  const growthRollup = report.growthRollup;
  const townRollup = report.listingsByTownRollup

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
        <p className="mt-1 font-mono text-[9px] tracking-[0.12em] uppercase text-charcoal/45">
          Hover or click a table name for what it stores · click headers to sort
          · footer is the sum of every row
        </p>
        <div className="mt-3 max-h-[36rem] overflow-auto rounded-lg border border-charcoal/[0.08]">
          <table className="border-collapse text-left w-max min-w-full">
            <thead className="sticky top-0 z-[1] bg-cream/95">
              <tr>
                <SortHeader
                  label="Table"
                  active={sizeSort.key === "table"}
                  dir={sizeSort.dir}
                  onClick={() => cycleSize("table")}
                />
                <SortHeader
                  label="Rows"
                  align="right"
                  active={sizeSort.key === "rows"}
                  dir={sizeSort.dir}
                  onClick={() => cycleSize("rows")}
                />
                <SortHeader
                  label="Total"
                  align="right"
                  active={sizeSort.key === "total"}
                  dir={sizeSort.dir}
                  onClick={() => cycleSize("total")}
                />
                <SortHeader
                  label="Heap"
                  align="right"
                  active={sizeSort.key === "heap"}
                  dir={sizeSort.dir}
                  onClick={() => cycleSize("heap")}
                />
                <SortHeader
                  label="Toast"
                  align="right"
                  active={sizeSort.key === "toast"}
                  dir={sizeSort.dir}
                  onClick={() => cycleSize("toast")}
                />
                <SortHeader
                  label="Indexes"
                  align="right"
                  active={sizeSort.key === "indexes"}
                  dir={sizeSort.dir}
                  onClick={() => cycleSize("indexes")}
                />
              </tr>
            </thead>
            <tbody>
              {tables.map((row) => (
                <tr key={row.table}>
                  <td className={TD}>
                    <TablePurposeName
                      name={row.table}
                      purpose={row.purpose || tablePurposeFor(row.table)}
                    />
                  </td>
                  <td className={`${TD} text-right`}>{formatCount(row.rows)}</td>
                  <td className={`${TD} text-right`}>{row.totalLabel}</td>
                  <td className={`${TD} text-right`}>{row.heapLabel}</td>
                  <td className={`${TD} text-right`}>{row.toastLabel}</td>
                  <td className={`${TD} text-right`}>{row.indexLabel}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="sticky bottom-0">
              <tr>
                <td className={TF}>Sum</td>
                <td className={`${TF} text-right`}>{tableRollup.rowsLabel}</td>
                <td className={`${TF} text-right`}>{tableRollup.totalLabel}</td>
                <td className={`${TF} text-right`}>{tableRollup.heapLabel}</td>
                <td className={`${TF} text-right`}>{tableRollup.toastLabel}</td>
                <td className={`${TF} text-right`}>{tableRollup.indexLabel}</td>
              </tr>
            </tfoot>
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
          Listings by town
        </h3>
        <p className="mt-1 font-mono text-[9px] tracking-[0.12em] uppercase text-charcoal/45">
          + newly listed · − newly closed · footer is the sum of every town
        </p>
        {towns.length === 0 ? (
          <p className="mt-3 text-sm text-charcoal/55">
            No per-town listing increments in this snapshot.
          </p>
        ) : (
          <div className="mt-3 max-h-[36rem] overflow-auto rounded-lg border border-charcoal/[0.08]">
            <table className="border-collapse text-left w-max min-w-full">
              <thead className="sticky top-0 z-[1] bg-cream/95">
                <tr>
                  <SortHeader
                    label="Town"
                    active={townSort.key === "town"}
                    dir={townSort.dir}
                    onClick={() => cycleTown("town")}
                  />
                  <SortHeader
                    label="Active"
                    align="right"
                    active={townSort.key === "active"}
                    dir={townSort.dir}
                    onClick={() => cycleTown("active")}
                  />
                  <SortHeader
                    label="Closed"
                    align="right"
                    active={townSort.key === "closed"}
                    dir={townSort.dir}
                    onClick={() => cycleTown("closed")}
                  />
                  <SortHeader
                    label="+24h"
                    align="right"
                    active={townSort.key === "listed1d"}
                    dir={townSort.dir}
                    onClick={() => cycleTown("listed1d")}
                  />
                  <SortHeader
                    label="−24h"
                    align="right"
                    active={townSort.key === "closed1d"}
                    dir={townSort.dir}
                    onClick={() => cycleTown("closed1d")}
                  />
                  <SortHeader
                    label="Net 24h"
                    align="right"
                    active={townSort.key === "net1d"}
                    dir={townSort.dir}
                    onClick={() => cycleTown("net1d")}
                  />
                  <SortHeader
                    label="+7d"
                    align="right"
                    active={townSort.key === "listed7d"}
                    dir={townSort.dir}
                    onClick={() => cycleTown("listed7d")}
                  />
                  <SortHeader
                    label="−7d"
                    align="right"
                    active={townSort.key === "closed7d"}
                    dir={townSort.dir}
                    onClick={() => cycleTown("closed7d")}
                  />
                  <SortHeader
                    label="+30d"
                    align="right"
                    active={townSort.key === "listed30d"}
                    dir={townSort.dir}
                    onClick={() => cycleTown("listed30d")}
                  />
                  <SortHeader
                    label="−30d"
                    align="right"
                    active={townSort.key === "closed30d"}
                    dir={townSort.dir}
                    onClick={() => cycleTown("closed30d")}
                  />
                </tr>
              </thead>
              <tbody>
                {towns.map((row) => (
                  <tr key={row.town}>
                    <td className={TD}>{row.town}</td>
                    <td className={`${TD} text-right`}>{formatCount(row.active)}</td>
                    <td className={`${TD} text-right`}>{formatCount(row.closed)}</td>
                    <td className={`${TD} text-right ${signedClass(row.listed1d)}`}>
                      {formatSignedCount(row.listed1d)}
                    </td>
                    <td className={`${TD} text-right ${signedClass(-row.closed1d)}`}>
                      {formatSignedCount(-row.closed1d)}
                    </td>
                    <td className={`${TD} text-right ${signedClass(row.net1d)}`}>
                      {formatSignedCount(row.net1d)}
                    </td>
                    <td className={`${TD} text-right ${signedClass(row.listed7d)}`}>
                      {formatSignedCount(row.listed7d)}
                    </td>
                    <td className={`${TD} text-right ${signedClass(-row.closed7d)}`}>
                      {formatSignedCount(-row.closed7d)}
                    </td>
                    <td className={`${TD} text-right ${signedClass(row.listed30d)}`}>
                      {formatSignedCount(row.listed30d)}
                    </td>
                    <td className={`${TD} text-right ${signedClass(-row.closed30d)}`}>
                      {formatSignedCount(-row.closed30d)}
                    </td>
                  </tr>
                ))}
              </tbody>
              {townRollup ? (
                <tfoot className="sticky bottom-0">
                  <tr>
                    <td className={TF}>Sum · {townRollup.townsLabel} towns</td>
                    <td className={`${TF} text-right`}>{townRollup.activeLabel}</td>
                    <td className={`${TF} text-right`}>{townRollup.closedLabel}</td>
                    <td className={`${TF} text-right`}>{townRollup.listed1dLabel}</td>
                    <td className={`${TF} text-right`}>{townRollup.closed1dLabel}</td>
                    <td className={`${TF} text-right`}>{townRollup.net1dLabel}</td>
                    <td className={`${TF} text-right`}>{townRollup.listed7dLabel}</td>
                    <td className={`${TF} text-right`}>{townRollup.closed7dLabel}</td>
                    <td className={`${TF} text-right`}>{townRollup.listed30dLabel}</td>
                    <td className={`${TF} text-right`}>{townRollup.closed30dLabel}</td>
                  </tr>
                </tfoot>
              ) : null}
            </table>
          </div>
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
            <p className="mt-1 font-mono text-[9px] tracking-[0.12em] uppercase text-charcoal/45">
              Hover or click a table name for what it stores · click headers to
              sort · footer is the sum of every row
            </p>
            <div className="mt-3 max-h-[36rem] overflow-auto rounded-lg border border-charcoal/[0.08]">
              <table className="border-collapse text-left w-max min-w-full">
                <thead className="sticky top-0 z-[1] bg-cream/95">
                  <tr>
                    <SortHeader
                      label="Table"
                      active={growthSort.key === "table"}
                      dir={growthSort.dir}
                      onClick={() => cycleGrowth("table")}
                    />
                    <SortHeader
                      label="Column"
                      active={growthSort.key === "column"}
                      dir={growthSort.dir}
                      onClick={() => cycleGrowth("column")}
                    />
                    <SortHeader
                      label="24h"
                      align="right"
                      active={growthSort.key === "d1"}
                      dir={growthSort.dir}
                      onClick={() => cycleGrowth("d1")}
                    />
                    <SortHeader
                      label="7d"
                      align="right"
                      active={growthSort.key === "d7"}
                      dir={growthSort.dir}
                      onClick={() => cycleGrowth("d7")}
                    />
                    <SortHeader
                      label="30d"
                      align="right"
                      active={growthSort.key === "d30"}
                      dir={growthSort.dir}
                      onClick={() => cycleGrowth("d30")}
                    />
                    <SortHeader
                      label="Per day"
                      align="right"
                      active={growthSort.key === "perDay"}
                      dir={growthSort.dir}
                      onClick={() => cycleGrowth("perDay")}
                    />
                    <SortHeader
                      label="Bytes/day"
                      align="right"
                      active={growthSort.key === "bytesPerDay"}
                      dir={growthSort.dir}
                      onClick={() => cycleGrowth("bytesPerDay")}
                    />
                  </tr>
                </thead>
                <tbody>
                  {growth.map((row) => (
                    <tr key={`${row.table}.${row.column}`}>
                      <td className={TD}>
                        <TablePurposeName
                          name={row.table}
                          purpose={tablePurposeFor(row.table)}
                        />
                      </td>
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
                <tfoot className="sticky bottom-0">
                  <tr>
                    <td className={TF}>Sum</td>
                    <td className={TF} />
                    <td className={`${TF} text-right`}>{growthRollup.d1Label}</td>
                    <td className={`${TF} text-right`}>{growthRollup.d7Label}</td>
                    <td className={`${TF} text-right`}>{growthRollup.d30Label}</td>
                    <td className={`${TF} text-right`}>
                      {growthRollup.perDayLabel}
                    </td>
                    <td className={`${TF} text-right`}>
                      {growthRollup.bytesPerDayLabel}
                    </td>
                  </tr>
                </tfoot>
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
            <div className="max-h-[36rem] overflow-auto rounded-lg border border-charcoal/[0.08]">
              <table className="border-collapse text-left w-max min-w-full">
                <thead className="sticky top-0 z-[1] bg-cream/95">
                  <tr>
                    <SortHeader
                      label="Calls"
                      align="right"
                      active={chatterSort.key === "calls"}
                      dir={chatterSort.dir}
                      onClick={() => cycleChatter("calls")}
                    />
                    <SortHeader
                      label="Calls/day"
                      align="right"
                      active={chatterSort.key === "callsPerDay"}
                      dir={chatterSort.dir}
                      onClick={() => cycleChatter("callsPerDay")}
                    />
                    <SortHeader
                      label="Every"
                      align="right"
                      active={chatterSort.key === "everyLabel"}
                      dir={chatterSort.dir}
                      onClick={() => cycleChatter("everyLabel")}
                    />
                    <SortHeader
                      label="Query"
                      active={chatterSort.key === "query"}
                      dir={chatterSort.dir}
                      onClick={() => cycleChatter("query")}
                    />
                  </tr>
                </thead>
                <tbody>
                  {chatterRows.map((row, idx) => (
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

function sizeValue(row: DbSizeTable, key: SizeSortKey): string | number {
  if (key === "table") return row.table;
  return row[key];
}

function growthValue(
  row: DbSizeGrowthRow,
  key: GrowthSortKey,
): string | number {
  return row[key];
}

function townValue(row: DbSizeListingsTown, key: TownSortKey): string | number {
  return row[key];
}
