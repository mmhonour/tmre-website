"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type RetsStatus = {
  configured: boolean;
  status: string;
  ok: boolean;
  message: string;
  checkedAt: string | null;
  detail?: string;
};

function formatTimestamp(iso: string | null | undefined): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

/**
 * MLS / RETS login probe status — own panel above Database sync on Admin → DB.
 */
export default function AdminRetsConnectionPanel({
  initial,
}: {
  initial?: RetsStatus | null;
}) {
  const [rets, setRets] = useState<RetsStatus | null>(initial ?? null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch("/api/admin/sync", { cache: "no-store" });
        if (!res.ok) return;
        const body = (await res.json()) as { rets?: RetsStatus };
        if (!cancelled && body.rets) setRets(body.rets);
      } catch {
        // keep last known
      }
    };
    void load();
    const id = window.setInterval(() => void load(), 30_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  return (
    <div
      id="admin-rets-connection"
      className="scroll-mt-24 overflow-hidden rounded-2xl border border-charcoal/[0.08] bg-white shadow-sm shadow-charcoal/[0.04]"
    >
      <div className="px-5 sm:px-6 py-4 border-b border-charcoal/[0.08] bg-cream/40 flex items-baseline justify-between gap-4">
        <p className="font-mono text-[11px] tracking-[0.2em] uppercase text-gold">
          RETS
        </p>
        <Link
          href="/admin?tab=rets"
          className="font-mono text-[10px] tracking-[0.12em] uppercase text-charcoal/45 hover:text-navy hover:underline underline-offset-2"
        >
          Credentials
        </Link>
      </div>
      <div
        className={`px-5 sm:px-6 py-4 ${
          rets?.ok ? "bg-sage/10" : rets ? "bg-rose-50/90" : "bg-white"
        }`}
      >
        {rets ? (
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-mono text-[10px] tracking-[0.16em] uppercase text-charcoal/50 mb-1">
                MLS / RETS connection
              </p>
              <p
                className={`text-sm font-medium leading-snug ${
                  rets.ok ? "text-sage" : "text-rose-800"
                }`}
              >
                {rets.message}
              </p>
              {rets.detail && !rets.ok ? (
                <p className="mt-1 font-mono text-[10px] text-rose-700/80 break-words">
                  {rets.detail}
                </p>
              ) : null}
            </div>
            <p className="font-mono text-[10px] text-charcoal/45 shrink-0">
              {rets.checkedAt
                ? `Checked ${formatTimestamp(rets.checkedAt)}`
                : "Not checked yet"}
            </p>
          </div>
        ) : (
          <p className="font-mono text-[11px] text-charcoal/45">
            Checking RETS login…
          </p>
        )}
      </div>
    </div>
  );
}
