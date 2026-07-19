"use client";

import { useState } from "react";
import {
  TIGERWEB_ZCTA_LAYER,
  TIGERWEB_ZCTA_MAPSERVER,
  tigerwebZctaQueryUrl,
} from "@/lib/zip-boundary-tiger";

type Inventory = {
  storedCount: number;
  expectedCount: number;
  oldestFetchedAt: string | null;
  newestFetchedAt: string | null;
  stale: boolean;
};

function formatTs(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(d);
}

export default function AdminZipBoundariesSyncPanel({
  inventory,
  lastSyncAt,
  lastSyncStartedAt,
  nextRunAt,
  exampleZip = "06880",
}: {
  inventory: Inventory;
  lastSyncAt: string | null;
  lastSyncStartedAt: string | null;
  nextRunAt: string | null;
  exampleZip?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const exampleUrl = tigerwebZctaQueryUrl(exampleZip);

  async function runSync() {
    setBusy(true);
    setMessage(null);
    setError(null);
    try {
      const res = await fetch("/api/admin/sync", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "zip-boundaries" }),
      });
      const body = (await res.json()) as {
        ok?: boolean;
        message?: string;
        detail?: string;
        error?: string;
      };
      if (!res.ok || body.ok === false) {
        throw new Error(body.error ?? body.message ?? `HTTP ${res.status}`);
      }
      setMessage(body.detail ?? body.message ?? "Zip boundaries synced");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <p className="font-mono text-[10px] tracking-[0.16em] uppercase text-charcoal/45 mb-2">
          Storage
        </p>
        <p className="text-sm text-charcoal/70 leading-relaxed">
          Outer ZCTA rings live in Postgres table{" "}
          <code className="font-mono text-[11px] text-navy">zip_boundaries</code>{" "}
          (JSONB blobs). Faster than a CDN hop for this small payload — maps read{" "}
          <code className="font-mono text-[11px] text-navy">GET /api/zip-boundaries</code>{" "}
          instead of Census on every hover.
        </p>
        <dl className="mt-3 grid gap-2 sm:grid-cols-2 font-mono text-[11px]">
          <div className="rounded-lg border border-charcoal/[0.08] bg-cream/30 px-3 py-2">
            <dt className="text-charcoal/45 uppercase tracking-[0.12em] text-[9px]">
              Stored / expected
            </dt>
            <dd className="mt-0.5 text-navy tabular-nums">
              {inventory.storedCount} / {inventory.expectedCount}
              {inventory.stale ? (
                <span className="ml-2 text-coral">stale</span>
              ) : (
                <span className="ml-2 text-sage">fresh</span>
              )}
            </dd>
          </div>
          <div className="rounded-lg border border-charcoal/[0.08] bg-cream/30 px-3 py-2">
            <dt className="text-charcoal/45 uppercase tracking-[0.12em] text-[9px]">
              Last monthly sync
            </dt>
            <dd className="mt-0.5 text-navy">{formatTs(lastSyncAt)}</dd>
          </div>
          <div className="rounded-lg border border-charcoal/[0.08] bg-cream/30 px-3 py-2">
            <dt className="text-charcoal/45 uppercase tracking-[0.12em] text-[9px]">
              Newest row fetched
            </dt>
            <dd className="mt-0.5 text-navy">{formatTs(inventory.newestFetchedAt)}</dd>
          </div>
          <div className="rounded-lg border border-charcoal/[0.08] bg-cream/30 px-3 py-2">
            <dt className="text-charcoal/45 uppercase tracking-[0.12em] text-[9px]">
              Next scheduled
            </dt>
            <dd className="mt-0.5 text-navy">{formatTs(nextRunAt)}</dd>
          </div>
        </dl>
        {lastSyncStartedAt && !lastSyncAt ? (
          <p className="mt-2 font-mono text-[10px] text-gold">
            Sync started {formatTs(lastSyncStartedAt)} — in progress or interrupted
          </p>
        ) : null}
      </div>

      <div>
        <p className="font-mono text-[10px] tracking-[0.16em] uppercase text-charcoal/45 mb-2">
          Census TIGERweb on the internet
        </p>
        <ul className="space-y-2 text-sm text-charcoal/70 leading-relaxed">
          <li>
            <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-charcoal/40">
              MapServer
            </span>
            <br />
            <a
              href={TIGERWEB_ZCTA_MAPSERVER}
              target="_blank"
              rel="noopener noreferrer"
              className="font-mono text-[11px] text-navy break-all hover:underline"
            >
              {TIGERWEB_ZCTA_MAPSERVER}
            </a>
          </li>
          <li>
            Layer <strong>{TIGERWEB_ZCTA_LAYER}</strong> = 2020 Census ZIP Code Tabulation
            Areas (ZCTA5).
          </li>
          <li>
            Query mechanism: ArcGIS REST{" "}
            <code className="font-mono text-[11px] text-navy">/query</code> with{" "}
            <code className="font-mono text-[11px]">where=ZCTA5=&apos;xxxxx&apos;</code>,{" "}
            <code className="font-mono text-[11px]">f=geojson</code>,{" "}
            <code className="font-mono text-[11px]">outSR=4326</code>,{" "}
            <code className="font-mono text-[11px]">returnGeometry=true</code>.
          </li>
          <li>
            Example ({exampleZip}):{" "}
            <a
              href={exampleUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="font-mono text-[11px] text-navy break-all hover:underline"
            >
              {exampleUrl}
            </a>
          </li>
        </ul>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={busy}
          onClick={() => void runSync()}
          className="rounded-lg border border-navy/20 bg-navy px-4 py-2 font-mono text-[11px] tracking-[0.12em] uppercase text-white disabled:opacity-50 hover:bg-navy/90"
        >
          {busy ? "Syncing…" : "Sync zip boundaries now"}
        </button>
        <p className="text-xs text-charcoal/50">
          Same action as Database sync step 7 · Netlify{" "}
          <code className="font-mono text-[10px]">sync-zip-boundaries</code> monthly
        </p>
      </div>
      {message ? (
        <p className="font-mono text-[11px] text-sage">{message}</p>
      ) : null}
      {error ? (
        <p className="font-mono text-[11px] text-coral">{error}</p>
      ) : null}
    </div>
  );
}
