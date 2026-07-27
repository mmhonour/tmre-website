"use client";

import { useEffect, useState } from "react";
import type { InventorySnapshot } from "@/lib/db/listings-repo";

type RowStatus = "match" | "low" | "empty" | "missing" | "no-snapshot";

function rowStatus(current: number, ref: number | undefined): RowStatus {
  if (ref === undefined) return "no-snapshot";
  if (current === 0 && ref > 0) return "empty";
  if (ref === 0) return current === 0 ? "match" : "no-snapshot";
  const ratio = current / ref;
  if (ratio < 0.9) return "low";
  return "match";
}

function statusDot(s: RowStatus) {
  if (s === "match")
    return <span className="w-1.5 h-1.5 rounded-full bg-sage inline-block" />;
  if (s === "low")
    return <span className="w-1.5 h-1.5 rounded-full bg-gold inline-block" />;
  if (s === "empty")
    return (
      <span className="w-1.5 h-1.5 rounded-full bg-coral animate-pulse inline-block" />
    );
  return (
    <span className="w-1.5 h-1.5 rounded-full bg-charcoal/20 inline-block" />
  );
}

/**
 * Compares live Neon table row counts to the snapshot taken after the last
 * successful full resync. Health check: empty / large drops after sync.
 */
export default function AdminInventoryComparisonPanel({
  initialSnapshot = null,
}: {
  initialSnapshot?: InventorySnapshot | null;
}) {
  const [open, setOpen] = useState(true);
  const [liveCounts, setLiveCounts] = useState<Record<string, number>>({});
  const [snapshotCounts, setSnapshotCounts] = useState<Record<string, number>>(
    initialSnapshot?.counts ?? {},
  );
  const [capturedAt, setCapturedAt] = useState<string | null>(
    initialSnapshot?.capturedAt ?? null,
  );
  const [lastRefreshedAt, setLastRefreshedAt] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const REFRESH_MS = 30 * 60 * 1000;

    async function load() {
      try {
        const res = await fetch("/api/admin/inventory-snapshot", {
          cache: "no-store",
        });
        if (!res.ok) {
          if (!cancelled) {
            setLoadError(`Refresh failed (HTTP ${res.status})`);
          }
          return;
        }
        const data = (await res.json()) as {
          snapshot: InventorySnapshot | null;
          liveCounts: Record<string, number>;
          at: string;
          error?: string;
        };
        if (cancelled) return;
        setLiveCounts(data.liveCounts ?? {});
        setSnapshotCounts(data.snapshot?.counts ?? {});
        setCapturedAt(data.snapshot?.capturedAt ?? null);
        setLastRefreshedAt(data.at);
        setLoadError(null);
      } catch (err) {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : "Refresh failed");
        }
      }
    }

    void load();
    const id = window.setInterval(load, REFRESH_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  const hasSnapshot = capturedAt != null;

  const allTables = Array.from(
    new Set([...Object.keys(liveCounts), ...Object.keys(snapshotCounts)]),
  ).sort();

  const hasAnyMismatch = allTables.some((t) => {
    const s = rowStatus(liveCounts[t] ?? 0, snapshotCounts[t]);
    return s === "empty" || s === "low";
  });

  const overallDot = !hasSnapshot ? (
    <span className="w-1.5 h-1.5 rounded-full bg-charcoal/20 inline-block" />
  ) : hasAnyMismatch ? (
    <span className="w-1.5 h-1.5 rounded-full bg-coral animate-pulse inline-block" />
  ) : (
    <span className="w-1.5 h-1.5 rounded-full bg-sage inline-block" />
  );

  return (
    <div
      id="admin-inventory-comparison"
      className="scroll-mt-24 rounded-2xl border border-charcoal/[0.08] bg-white shadow-sm shadow-charcoal/[0.04] overflow-hidden"
    >
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
          {hasSnapshot ? (
            <span className="font-mono text-[9px] tracking-[0.12em] uppercase text-charcoal/40 border border-charcoal/15 rounded-full px-2 py-0.5 shrink-0">
              snapshot{" "}
              {new Date(capturedAt as string).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                hour: "numeric",
                minute: "2-digit",
              })}
            </span>
          ) : (
            <span className="font-mono text-[9px] tracking-[0.12em] uppercase text-charcoal/30 border border-charcoal/10 rounded-full px-2 py-0.5 shrink-0">
              no snapshot yet — run a full resync
            </span>
          )}
        </div>
        <span className="font-mono text-[10px] text-charcoal/40 shrink-0">
          {open ? "−" : "+"}
        </span>
      </button>

      {open && (
        <div className="border-t border-charcoal/[0.06]">
          <p className="px-5 sm:px-6 py-3 text-sm text-charcoal/65 leading-relaxed max-w-3xl">
            After each successful full resync, Admin saves exact row counts for
            every public Neon table. This panel compares those saved numbers to
            live <span className="font-mono text-[11px]">COUNT(*)</span> totals
            so you can spot emptied or shrunken tables. It is not MLS Active
            inventory by town — that is Listings by town.
          </p>
          {loadError ? (
            <p className="px-5 sm:px-6 pb-2 font-mono text-[10px] text-coral">
              {loadError}
            </p>
          ) : null}
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="bg-cream/40">
                  <th className="px-4 sm:px-5 py-2 font-mono text-[9px] tracking-[0.16em] uppercase text-charcoal/40 w-4" />
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
                {allTables.length === 0 ? (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-5 sm:px-6 py-6 text-sm text-charcoal/50"
                    >
                      Loading live table counts…
                    </td>
                  </tr>
                ) : (
                  allTables.map((table) => {
                    const current = liveCounts[table] ?? 0;
                    const ref = snapshotCounts[table];
                    const s = rowStatus(current, ref);
                    const delta = ref !== undefined ? current - ref : null;
                    return (
                      <tr
                        key={table}
                        className={
                          s === "empty"
                            ? "bg-coral/[0.04]"
                            : s === "low"
                              ? "bg-gold/[0.04]"
                              : ""
                        }
                      >
                        <td className="pl-4 sm:pl-5 pr-2 py-2">
                          {statusDot(s)}
                        </td>
                        <td className="px-4 sm:px-5 py-2 font-mono text-[11px] text-navy">
                          {table}
                        </td>
                        <td
                          className={`px-4 sm:px-5 py-2 font-mono text-[11px] tabular-nums text-right ${
                            s === "empty"
                              ? "text-coral font-semibold"
                              : s === "low"
                                ? "text-gold font-semibold"
                                : "text-charcoal/70"
                          }`}
                        >
                          {current.toLocaleString()}
                        </td>
                        <td className="px-4 sm:px-5 py-2 font-mono text-[11px] tabular-nums text-right text-charcoal/45">
                          {ref !== undefined ? ref.toLocaleString() : "—"}
                        </td>
                        <td
                          className={`px-4 sm:px-5 py-2 font-mono text-[11px] tabular-nums text-right ${
                            delta === null
                              ? "text-charcoal/25"
                              : delta < 0
                                ? "text-coral"
                                : delta > 0
                                  ? "text-sage"
                                  : "text-charcoal/35"
                          }`}
                        >
                          {delta === null
                            ? "—"
                            : delta === 0
                              ? "="
                              : delta > 0
                                ? `+${delta.toLocaleString()}`
                                : delta.toLocaleString()}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
          <p className="px-5 sm:px-6 py-3 font-mono text-[9px] text-charcoal/35 border-t border-charcoal/[0.04]">
            Snapshot = exact counts after last successful full resync · Current =
            live exact COUNT(*) · Auto-refreshes every 30 min
            {lastRefreshedAt
              ? ` · updated ${new Date(lastRefreshedAt).toLocaleTimeString(
                  "en-US",
                  { hour: "numeric", minute: "2-digit" },
                )}`
              : ""}
          </p>
        </div>
      )}
    </div>
  );
}
