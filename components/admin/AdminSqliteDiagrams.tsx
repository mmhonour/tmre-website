"use client";

import { useLayoutEffect, useMemo, useRef, useState } from "react";
import type {
  SqliteDatabaseDiagram,
  SqliteRelationship,
  SqliteTableInfo,
} from "@/lib/sqlite-schema-diagram-types";
import { formatBytes } from "@/lib/sqlite-schema-diagram-types";
import type { InventorySnapshot } from "@/lib/listings-db";

type AnchorPoint = { x: number; y: number };
type ConnectorPath = {
  key: string;
  d: string;
  label: string;
};

export type BlobPersistRuntimeInfo = {
  active: boolean;
  mode: "netlify-blobs" | "local-file";
  reason: string;
  absoluteMinListingCount: number;
  lastGoodListingCount: number | null;
  lastPersistAt: string | null;
  lastPersistResult: "ok" | "skipped_degraded" | null;
  lastDegradedCount: number | null;
  lastDegradedThreshold: number | null;
  lastRestoreAt: string | null;
};

function formatBlobTimestamp(iso: string | null): string {
  if (!iso) return "never";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "never";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function BlobPersistRuntimeBanner({ runtime }: { runtime: BlobPersistRuntimeInfo }) {
  const skippedDegraded = runtime.lastPersistResult === "skipped_degraded";
  return (
    <div
      className={`rounded-2xl border px-5 sm:px-6 py-4 ${
        skippedDegraded
          ? "border-coral/25 bg-coral/[0.06]"
          : "border-charcoal/[0.08] bg-white"
      }`}
    >
      <div className="flex flex-wrap items-center gap-2 mb-2">
        <span
          className={`inline-block w-1.5 h-1.5 rounded-full ${
            runtime.active ? "bg-sage" : "bg-charcoal/30"
          }`}
        />
        <p className="font-mono text-[11px] tracking-[0.2em] uppercase text-gold">
          Blob persistence runtime
        </p>
        <span className="font-mono text-[10px] tracking-[0.12em] uppercase text-charcoal/50 border border-charcoal/15 rounded-full px-2 py-0.5">
          {runtime.active ? "Netlify Blobs active" : "Local file — no blobs"}
        </span>
      </div>
      <p className="text-sm text-slate leading-snug max-w-3xl">{runtime.reason}</p>
      {skippedDegraded ? (
        <p className="mt-2 text-sm text-coral leading-snug max-w-3xl">
          Last checkpoint was <strong>refused</strong> — write DB had only{" "}
          {runtime.lastDegradedCount?.toLocaleString() ?? "?"} listings, below the
          threshold of {runtime.lastDegradedThreshold?.toLocaleString() ?? "?"}. The good
          blob snapshot was left untouched. Run a <strong>Full resync</strong> to
          repopulate the DB above the minimum ({runtime.absoluteMinListingCount.toLocaleString()}).
        </p>
      ) : null}
      <dl className="mt-3 font-mono text-[11px] text-charcoal/70 space-y-1">
        <div>
          <dt className="inline text-charcoal/45">min listing count: </dt>
          <dd className="inline break-all">
            {runtime.absoluteMinListingCount.toLocaleString()}
            <span className="text-charcoal/35"> (checkpoint refused below this)</span>
          </dd>
        </div>
        <div>
          <dt className="inline text-charcoal/45">last known-good count: </dt>
          <dd className="inline break-all">
            {runtime.lastGoodListingCount != null
              ? runtime.lastGoodListingCount.toLocaleString()
              : "—"}
          </dd>
        </div>
        <div>
          <dt className="inline text-charcoal/45">last checkpoint: </dt>
          <dd className={`inline break-all ${skippedDegraded ? "text-coral" : ""}`}>
            {formatBlobTimestamp(runtime.lastPersistAt)}
            {runtime.lastPersistResult
              ? ` (${runtime.lastPersistResult === "ok" ? "ok" : "skipped — degraded"})`
              : ""}
          </dd>
        </div>
        <div>
          <dt className="inline text-charcoal/45">last restore: </dt>
          <dd className="inline break-all">{formatBlobTimestamp(runtime.lastRestoreAt)}</dd>
        </div>
      </dl>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Inventory comparison panel
// ---------------------------------------------------------------------------

type RowStatus = "match" | "low" | "empty" | "missing" | "no-snapshot";

function rowStatus(current: number, ref: number | undefined): RowStatus {
  if (ref === undefined) return "no-snapshot";
  if (current === 0 && ref > 0) return "empty";
  if (ref === 0) return current === 0 ? "match" : "no-snapshot";
  const ratio = current / ref;
  if (ratio < 0.5) return "low";
  if (ratio < 0.9) return "low";
  return "match";
}

function statusDot(s: RowStatus) {
  if (s === "match") return <span className="w-1.5 h-1.5 rounded-full bg-sage inline-block" />;
  if (s === "low") return <span className="w-1.5 h-1.5 rounded-full bg-gold inline-block" />;
  if (s === "empty") return <span className="w-1.5 h-1.5 rounded-full bg-coral animate-pulse inline-block" />;
  return <span className="w-1.5 h-1.5 rounded-full bg-charcoal/20 inline-block" />;
}

function InventoryComparisonPanel({
  snapshot,
  liveDb,
}: {
  snapshot: InventorySnapshot | null;
  liveDb: SqliteDatabaseDiagram | undefined;
}) {
  const [open, setOpen] = useState(true);

  // Build the union of all table names from both sources
  const snapshotCounts = snapshot?.counts ?? {};
  const liveCounts: Record<string, number> = {};
  for (const t of liveDb?.tables ?? []) liveCounts[t.name] = t.rowCount;

  const allTables = Array.from(
    new Set([...Object.keys(liveCounts), ...Object.keys(snapshotCounts)]),
  ).sort();

  const hasAnyMismatch = allTables.some((t) => {
    const s = rowStatus(liveCounts[t] ?? 0, snapshotCounts[t]);
    return s === "empty" || s === "low";
  });

  const overallDot = !snapshot
    ? <span className="w-1.5 h-1.5 rounded-full bg-charcoal/20 inline-block" />
    : hasAnyMismatch
    ? <span className="w-1.5 h-1.5 rounded-full bg-coral animate-pulse inline-block" />
    : <span className="w-1.5 h-1.5 rounded-full bg-sage inline-block" />;

  return (
    <div className="rounded-2xl border border-charcoal/[0.08] bg-white shadow-sm shadow-charcoal/[0.04] overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-4 px-5 sm:px-6 py-4 text-left hover:bg-cream/30 transition-colors"
      >
        <div className="flex items-center gap-2.5 min-w-0">
          {overallDot}
          <p className="font-mono text-[11px] tracking-[0.2em] uppercase text-gold">
            Inventory comparison
          </p>
          {snapshot ? (
            <span className="font-mono text-[9px] tracking-[0.12em] uppercase text-charcoal/40 border border-charcoal/15 rounded-full px-2 py-0.5 shrink-0">
              snapshot {new Date(snapshot.capturedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
            </span>
          ) : (
            <span className="font-mono text-[9px] tracking-[0.12em] uppercase text-charcoal/30 border border-charcoal/10 rounded-full px-2 py-0.5 shrink-0">
              no snapshot yet — run a full resync
            </span>
          )}
        </div>
        <span className="font-mono text-[10px] text-charcoal/40 shrink-0">{open ? "−" : "+"}</span>
      </button>

      {open && (
        <div className="border-t border-charcoal/[0.06] overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="bg-cream/40">
                <th className="px-4 sm:px-5 py-2 font-mono text-[9px] tracking-[0.16em] uppercase text-charcoal/40 w-4">
                </th>
                <th className="px-4 sm:px-5 py-2 font-mono text-[9px] tracking-[0.16em] uppercase text-charcoal/40">
                  Table
                </th>
                <th className="px-4 sm:px-5 py-2 font-mono text-[9px] tracking-[0.16em] uppercase text-charcoal/40 text-right tabular-nums">
                  Current
                </th>
                <th className="px-4 sm:px-5 py-2 font-mono text-[9px] tracking-[0.16em] uppercase text-charcoal/40 text-right tabular-nums">
                  Snapshot
                </th>
                <th className="px-4 sm:px-5 py-2 font-mono text-[9px] tracking-[0.16em] uppercase text-charcoal/40 text-right tabular-nums">
                  Δ
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-charcoal/[0.04]">
              {allTables.map((table) => {
                const current = liveCounts[table] ?? 0;
                const ref = snapshotCounts[table];
                const s = rowStatus(current, ref);
                const delta = ref !== undefined ? current - ref : null;
                return (
                  <tr key={table} className={s === "empty" ? "bg-coral/[0.04]" : s === "low" ? "bg-gold/[0.04]" : ""}>
                    <td className="pl-4 sm:pl-5 pr-2 py-2">{statusDot(s)}</td>
                    <td className="px-4 sm:px-5 py-2 font-mono text-[11px] text-navy">
                      {table}
                    </td>
                    <td className={`px-4 sm:px-5 py-2 font-mono text-[11px] tabular-nums text-right ${
                      s === "empty" ? "text-coral font-semibold" : s === "low" ? "text-gold font-semibold" : "text-charcoal/70"
                    }`}>
                      {current.toLocaleString()}
                    </td>
                    <td className="px-4 sm:px-5 py-2 font-mono text-[11px] tabular-nums text-right text-charcoal/45">
                      {ref !== undefined ? ref.toLocaleString() : "—"}
                    </td>
                    <td className={`px-4 sm:px-5 py-2 font-mono text-[11px] tabular-nums text-right ${
                      delta === null ? "text-charcoal/25" : delta < 0 ? "text-coral" : delta > 0 ? "text-sage" : "text-charcoal/35"
                    }`}>
                      {delta === null ? "—" : delta === 0 ? "=" : delta > 0 ? `+${delta.toLocaleString()}` : delta.toLocaleString()}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="px-5 sm:px-6 py-3 font-mono text-[9px] text-charcoal/35 border-t border-charcoal/[0.04]">
            Snapshot captured after last successful full resync · Current = live Lambda counts
          </p>
        </div>
      )}
    </div>
  );
}

function formatColumnLine(col: SqliteTableInfo["columns"][number]): string {
  const flags = [
    col.primaryKey ? "PK" : null,
    col.notNull ? "NOT NULL" : null,
  ]
    .filter(Boolean)
    .join(" · ");
  return flags ? `${col.name}  ${col.type}  ${flags}` : `${col.name}  ${col.type}`;
}

function relationshipLabel(rel: SqliteRelationship): string {
  return `${rel.from.table}.${rel.from.column} → ${rel.to.table}.${rel.to.column}`;
}

function bezierPath(from: AnchorPoint, to: AnchorPoint): string {
  const dx = Math.abs(to.x - from.x);
  const bend = Math.max(28, dx * 0.45);
  const c1x = from.x + (to.x >= from.x ? bend : -bend);
  const c2x = to.x + (to.x >= from.x ? -bend : bend);
  return `M ${from.x} ${from.y} C ${c1x} ${from.y}, ${c2x} ${to.y}, ${to.x} ${to.y}`;
}

function columnAnchor(
  container: HTMLElement,
  table: string,
  column: string,
  side: "left" | "right",
): AnchorPoint | null {
  const row = container.querySelector<HTMLElement>(
    `[data-schema-table="${table}"][data-schema-column="${column}"]`,
  );
  if (!row) return null;
  const containerRect = container.getBoundingClientRect();
  const rect = row.getBoundingClientRect();
  return {
    x:
      side === "right"
        ? rect.right - containerRect.left
        : rect.left - containerRect.left,
    y: rect.top + rect.height / 2 - containerRect.top,
  };
}

function TableCard({
  table,
  foreignKeyColumns,
}: {
  table: SqliteTableInfo;
  foreignKeyColumns: Set<string>;
}) {
  return (
    <div
      data-schema-table={table.name}
      className="min-w-[14rem] max-w-[18rem] rounded-xl border border-charcoal/[0.12] bg-cream/30 overflow-hidden shadow-sm shadow-charcoal/[0.03]"
    >
      <div className="flex items-center justify-between gap-3 px-3 py-2 border-b border-charcoal/[0.1] bg-navy text-white">
        <p className="font-mono text-[11px] tracking-[0.12em] uppercase truncate">
          {table.name}
        </p>
        <p className="font-mono text-[10px] tabular-nums text-white/60 shrink-0">
          {table.name === "listing_photos" ? "≈" : ""}
          {table.rowCount.toLocaleString()} rows
        </p>
      </div>
      <ul className="divide-y divide-charcoal/[0.06]">
        {table.columns.map((col) => {
          const isFk = foreignKeyColumns.has(col.name);
          return (
            <li
              key={col.name}
              data-schema-table={table.name}
              data-schema-column={col.name}
              className={`relative px-3 py-1.5 font-mono text-[11px] leading-snug ${
                col.primaryKey
                  ? "text-navy font-semibold bg-gold/10"
                  : isFk
                    ? "text-navy bg-navy/[0.03]"
                    : "text-charcoal/75"
              }`}
            >
              {col.primaryKey ? (
                <span
                  className="absolute left-0 top-1 bottom-1 w-0.5 rounded-full bg-gold"
                  aria-hidden
                />
              ) : null}
              {isFk ? (
                <span
                  className="absolute right-0 top-1 bottom-1 w-0.5 rounded-full bg-navy/35"
                  aria-hidden
                />
              ) : null}
              <span className="block truncate" title={formatColumnLine(col)}>
                <span className={col.primaryKey || isFk ? "text-navy" : "text-charcoal"}>
                  {col.name}
                </span>
                <span className="text-charcoal/40"> · </span>
                <span className="text-slate">{col.type || "ANY"}</span>
                {col.primaryKey ? (
                  <span className="ml-1 text-[9px] tracking-wide uppercase text-gold">
                    pk
                  </span>
                ) : null}
                {isFk ? (
                  <span className="ml-1 text-[9px] tracking-wide uppercase text-navy/55">
                    fk
                  </span>
                ) : null}
                {col.notNull && !col.primaryKey ? (
                  <span className="ml-1 text-[9px] tracking-wide uppercase text-charcoal/35">
                    nn
                  </span>
                ) : null}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function SchemaRelationshipCanvas({
  tables,
  relationships,
  markerId,
}: {
  tables: SqliteTableInfo[];
  relationships: SqliteRelationship[];
  markerId: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [paths, setPaths] = useState<ConnectorPath[]>([]);
  const [size, setSize] = useState({ width: 0, height: 0 });

  const foreignKeyColumnsByTable = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const rel of relationships) {
      const set = map.get(rel.to.table) ?? new Set<string>();
      set.add(rel.to.column);
      map.set(rel.to.table, set);
    }
    return map;
  }, [relationships]);

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container || relationships.length === 0) {
      setPaths([]);
      return;
    }

    const measure = () => {
      const { width, height } = container.getBoundingClientRect();
      setSize({ width, height });

      const next: ConnectorPath[] = [];
      for (const rel of relationships) {
        const from = columnAnchor(container, rel.from.table, rel.from.column, "right");
        const to = columnAnchor(container, rel.to.table, rel.to.column, "left");
        if (!from || !to) continue;

        const start =
          from.x <= to.x
            ? from
            : columnAnchor(container, rel.from.table, rel.from.column, "left") ?? from;
        const end =
          from.x <= to.x
            ? to
            : columnAnchor(container, rel.to.table, rel.to.column, "right") ?? to;

        next.push({
          key: `${rel.from.table}.${rel.from.column}->${rel.to.table}.${rel.to.column}`,
          d: bezierPath(start, end),
          label: relationshipLabel(rel),
        });
      }
      setPaths(next);
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(container);
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [relationships, tables]);

  if (tables.length === 0) {
    return <p className="text-sm text-slate">No tables to display.</p>;
  }

  return (
    <div className="space-y-4">
      {relationships.length > 0 ? (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-charcoal/[0.08] bg-cream/25 px-3 py-2.5">
          <p className="font-mono text-[10px] tracking-[0.16em] uppercase text-charcoal/45 shrink-0">
            Relationships
          </p>
          <ul className="flex flex-wrap gap-x-3 gap-y-1">
            {relationships.map((rel) => (
              <li
                key={relationshipLabel(rel)}
                className="font-mono text-[10px] text-slate"
                title={rel.source === "pragma" ? "SQLite FOREIGN KEY" : "Documented join"}
              >
                <span className="text-navy">{rel.from.table}</span>
                <span className="text-charcoal/35">.</span>
                <span className="text-gold">{rel.from.column}</span>
                <span className="text-charcoal/35"> → </span>
                <span className="text-navy">{rel.to.table}</span>
                <span className="text-charcoal/35">.</span>
                <span className="text-navy/70">{rel.to.column}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div ref={containerRef} className="relative min-h-[12rem]">
        {paths.length > 0 && size.width > 0 && size.height > 0 ? (
          <svg
            className="pointer-events-none absolute inset-0 z-0"
            width={size.width}
            height={size.height}
            aria-hidden
          >
            <defs>
              <marker
                id={markerId}
                markerWidth="7"
                markerHeight="7"
                refX="6"
                refY="3.5"
                orient="auto"
              >
                <path d="M0,0 L7,3.5 L0,7 Z" className="fill-navy/45" />
              </marker>
            </defs>
            {paths.map((path) => (
              <path
                key={path.key}
                d={path.d}
                fill="none"
                className="stroke-navy/30"
                strokeWidth={1.5}
                markerEnd={`url(#${markerId})`}
              >
                <title>{path.label}</title>
              </path>
            ))}
          </svg>
        ) : null}

        <div className="relative z-10 flex flex-wrap gap-4 min-w-0">
          {tables.map((table) => (
            <TableCard
              key={table.name}
              table={table}
              foreignKeyColumns={foreignKeyColumnsByTable.get(table.name) ?? new Set()}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function DatabaseDiagramCard({ db }: { db: SqliteDatabaseDiagram }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-charcoal/[0.08] bg-white shadow-sm shadow-charcoal/[0.04]">
      <div className="px-5 sm:px-6 py-4 border-b border-charcoal/[0.08] bg-cream/40">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 sm:gap-6">
          <div className="min-w-0">
            <p className="font-mono text-[11px] tracking-[0.2em] uppercase text-gold">
              {db.label}
            </p>
            <p className="mt-1 text-sm text-slate">{db.role}</p>
          </div>
          <div className="shrink-0 font-mono text-[11px] text-charcoal/55 sm:text-right space-y-1">
            <p>
              <span
                className={`inline-block w-1.5 h-1.5 rounded-full mr-2 align-middle ${
                  db.available ? "bg-sage" : "bg-coral/80"
                }`}
              />
              {db.available ? "Connected" : "Unavailable"}
            </p>
            <p className="tabular-nums">{formatBytes(db.sizeBytes)}</p>
            <p>
              {db.tables.length} table{db.tables.length === 1 ? "" : "s"}
              {db.relationships.length > 0
                ? ` · ${db.relationships.length} relationship${db.relationships.length === 1 ? "" : "s"}`
                : ""}
            </p>
          </div>
        </div>

        <div className="mt-4 rounded-xl border border-charcoal/[0.08] bg-white/70 px-3 sm:px-4 py-3">
          <p className="font-mono text-[10px] tracking-[0.16em] uppercase text-charcoal/40 mb-2">
            Storage location
          </p>
          <dl className="space-y-2">
            <div>
              <dt className="font-mono text-[9px] tracking-[0.14em] uppercase text-charcoal/35">
                Relative
              </dt>
              <dd className="mt-0.5 font-mono text-[11px] sm:text-xs text-navy break-all">
                {db.relativePath}
              </dd>
            </div>
            <div>
              <dt className="font-mono text-[9px] tracking-[0.14em] uppercase text-charcoal/35">
                Absolute
              </dt>
              <dd
                className="mt-0.5 font-mono text-[11px] sm:text-xs text-slate break-all"
                title={db.absolutePath}
              >
                {db.absolutePath}
              </dd>
            </div>
            <div>
              <dt className="font-mono text-[9px] tracking-[0.14em] uppercase text-charcoal/35">
                File
              </dt>
              <dd className="mt-0.5 font-mono text-[11px] sm:text-xs text-charcoal/70">
                {db.fileName}
                {db.exists ? "" : " · missing on disk"}
              </dd>
            </div>
          </dl>
        </div>

        {db.error ? (
          <p className="mt-3 text-sm text-coral">{db.error}</p>
        ) : null}
      </div>

      {db.tables.length > 0 ? (
        <div className="px-5 sm:px-6 py-5 overflow-x-auto">
          <SchemaRelationshipCanvas
            tables={db.tables}
            relationships={db.relationships}
            markerId={`schema-fk-arrow-${db.id}`}
          />
        </div>
      ) : (
        <div className="px-5 sm:px-6 py-8">
          <p className="text-sm text-slate">No tables to display.</p>
        </div>
      )}
    </div>
  );
}

export default function AdminSqliteDiagrams({
  databases,
  blobRuntime,
  inventorySnapshot,
}: {
  databases: SqliteDatabaseDiagram[];
  blobRuntime?: BlobPersistRuntimeInfo;
  inventorySnapshot?: InventorySnapshot | null;
}) {
  const writeDb = databases.find((db) => db.id === "listings");
  return (
    <div className="mt-6 space-y-6">
      <div>
        <p className="font-mono text-[11px] tracking-[0.2em] uppercase text-gold mb-2">
          SQLite databases
        </p>
        <p className="text-sm text-slate max-w-3xl">
          Live schema for every SQLite file this process uses — storage paths, tables,
          columns, approximate row counts, and PK→FK relationship lines where tables join
          on <span className="font-mono text-navy/80">listings.id</span>.
        </p>
      </div>
      {blobRuntime ? <BlobPersistRuntimeBanner runtime={blobRuntime} /> : null}
      <InventoryComparisonPanel
        snapshot={inventorySnapshot ?? null}
        liveDb={writeDb}
      />
      {databases.map((db) => (
        <DatabaseDiagramCard key={db.id} db={db} />
      ))}
    </div>
  );
}
