"use client";

import { useEffect, useState } from "react";
import type { StackCostRollup, StackCostStatus } from "@/lib/stack-cost-types";

function statusLabel(status: StackCostStatus): string {
  if (status === "ok") return "Live";
  if (status === "needs_key") return "Need key";
  if (status === "manual") return "Paste / CC";
  return "Error";
}

function statusClass(status: StackCostStatus): string {
  if (status === "ok") return "text-sage";
  if (status === "needs_key") return "text-gold";
  if (status === "manual") return "text-charcoal/55";
  return "text-coral";
}

function usd(n: number | null): string {
  if (n == null) return "—";
  return n.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

export default function AdminStackCostsPanel() {
  const [data, setData] = useState<StackCostRollup | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/admin/stack-costs", { cache: "no-store" })
      .then(async (r) => {
        const body = await r.json();
        if (!r.ok) throw new Error(body?.error || `HTTP ${r.status}`);
        return body as StackCostRollup;
      })
      .then((body) => {
        if (!cancelled) setData(body);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load");
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div
      id="admin-api-costs"
      className="scroll-mt-24 overflow-hidden rounded-2xl border border-charcoal/[0.08] bg-white shadow-sm shadow-charcoal/[0.04]"
    >
      <div className="border-b border-charcoal/[0.08] bg-cream/40 px-5 py-4 sm:px-6">
        <p className="font-mono text-[11px] tracking-[0.2em] uppercase text-gold">
          Jun / Jul API cost rollup
        </p>
        <p className="mt-1 text-sm text-charcoal/65">
          June 1 – July 31, 2026. APIs first where a vendor exposes usage;
          Netlify / Resend / AWS are paste-from-invoice. Keys go on{" "}
          <span className="font-mono text-[11px] text-navy">Netlify env</span>{" "}
          (and local{" "}
          <span className="font-mono text-[11px] text-navy">.env.local</span>
          ). Never commit them.
        </p>
        {data ? (
          <p className="mt-2 font-mono text-[10px] tracking-[0.12em] uppercase text-charcoal/40">
            Fetched {new Date(data.fetchedAt).toLocaleString()} · priced so far{" "}
            {usd(data.totalUsd)}
          </p>
        ) : null}
      </div>

      {error ? (
        <p className="px-5 py-4 text-sm text-coral sm:px-6">{error}</p>
      ) : !data ? (
        <p className="px-5 py-4 text-sm text-charcoal/55 sm:px-6">Loading…</p>
      ) : (
        <ul className="divide-y divide-charcoal/[0.06]">
          {data.rows.map((row) => (
            <li key={row.id} className="px-5 py-4 sm:px-6">
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <p className="font-mono text-[11px] tracking-[0.08em] text-navy">
                  {row.vendor}
                  <span className="ml-2 text-charcoal/45">{row.what}</span>
                </p>
                <p
                  className={`font-mono text-[10px] tracking-[0.14em] uppercase ${statusClass(row.status)}`}
                >
                  {statusLabel(row.status)}
                  <span className="ml-3 text-navy">{usd(row.amountUsd)}</span>
                </p>
              </div>
              <p className="mt-1.5 text-sm leading-relaxed text-charcoal/70">
                {row.need}
              </p>
              {row.envKeys.length ? (
                <p className="mt-1 font-mono text-[10px] text-charcoal/40">
                  {row.envKeys.join(" · ")}
                  {row.keysPresent ? " · present" : " · missing"}
                </p>
              ) : null}
              {row.note ? (
                <p className="mt-1 text-xs leading-relaxed text-charcoal/50">
                  {row.note}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
