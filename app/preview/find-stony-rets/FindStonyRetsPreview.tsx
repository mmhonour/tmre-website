"use client";

import { useMemo, useState } from "react";
import { findAddressDivergence } from "@/lib/find-address-divergence";
import {
  findListingHouseHasLetterSuffix,
  findListingStreetNumberHops,
  findListingStreetQueries,
  findListingStreetsMatch,
} from "@/lib/find-listing-street-match";
import {
  closedSearchDateForVision,
  closedSearchWindowForSaleDate,
} from "@/lib/find-listing-window";

const VISION_STREET = "2A STONY PT RD";
const MLS_STREET = "2A-A Stony Point Road";
const TOWN = "Westport";

const OWNERSHIP = {
  lastSaleDate: "09/12/2016",
  lastSalePrice: 0,
  fieldCard: {
    ownership: [
      {
        date: "09/12/2016",
        owner: "CASTILLO EDWARD AND SNYDER CAMERON",
        price: "$0",
        bookPage: "3729/0032",
        qualified: null,
        instrument: "29",
      },
      {
        date: "11/03/2014",
        owner: "CASTILLO EDWARD AND SYNDER CAMERON",
        price: "$1,530,000",
        bookPage: "3565/0068",
        qualified: null,
        instrument: "00",
      },
    ],
  },
} as const;

const FIXTURES = [
  { label: "2A Stony Pt", street: VISION_STREET, mls: MLS_STREET },
  { label: "16 Sea Spray", street: "16 Sea Spray Rd", mls: "16 Seaspray Road" },
  { label: "5 Locust Ln", street: "5 Locust Ln", mls: "5 Locust Lane" },
] as const;

type ProbeHit = {
  mlsId: string;
  status: string;
  street: string;
  streetNumber: string | null;
  streetName: string | null;
  unparsed: string | null;
};

type ProbeHop = {
  label: string;
  streetNumber?: string;
  streetNameContains?: string;
  addressContains?: string;
  count: number;
  hits: ProbeHit[];
  error?: string;
};

type ProbeResponse = {
  configured: boolean;
  message?: string;
  hops?: ProbeHop[];
};


export function FindStonyRetsPreview() {
  const [street, setStreet] = useState(VISION_STREET);
  const [mlsStreet, setMlsStreet] = useState(MLS_STREET);
  const [probe, setProbe] = useState<ProbeResponse | null>(null);
  const [busy, setBusy] = useState(false);

  const hops = useMemo(() => findListingStreetNumberHops(street), [street]);
  const unparsed = useMemo(() => findListingStreetQueries(street), [street]);
  const skipUnparsed = findListingHouseHasLetterSuffix(street);
  const matches = findListingStreetsMatch(street, mlsStreet);
  const diverge = findAddressDivergence(street, mlsStreet);
  const paidDate = closedSearchDateForVision(OWNERSHIP);
  const window = closedSearchWindowForSaleDate(paidDate, new Date("2026-09-10T00:00:00Z"));
  const quitclaimWindow = closedSearchWindowForSaleDate(
    "09/12/2016",
    new Date("2026-09-10T00:00:00Z"),
  );

  async function runProbe() {
    setBusy(true);
    setProbe(null);
    try {
      const res = await fetch("/api/preview/find-rets-hops", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ street, town: TOWN }),
      });
      setProbe((await res.json()) as ProbeResponse);
    } catch {
      setProbe({ configured: false, message: "Probe request failed" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap gap-2">
        {FIXTURES.map((row) => (
          <button
            key={row.street}
            type="button"
            onClick={() => {
              setStreet(row.street);
              setMlsStreet(row.mls);
              setProbe(null);
            }}
            className={`rounded-full border px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.12em] ${
              street === row.street
                ? "border-gold/50 bg-gold/10 text-navy"
                : "border-charcoal/[0.08] bg-white text-navy hover:border-gold/40"
            }`}
          >
            {row.label}
          </button>
        ))}
      </div>

      <label className="block">
        <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-slate">
          Vision street
        </span>
        <input
          value={street}
          onChange={(event) => {
            setStreet(event.target.value);
            setProbe(null);
          }}
          className="mt-1 w-full rounded-xl border border-charcoal/[0.1] bg-white px-3 py-2 font-mono text-sm text-navy"
        />
      </label>

      <section className="rounded-2xl border border-charcoal/[0.08] bg-white px-5 py-4">
        <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-gold">
          Closed window
        </p>
        <p className="mt-2 font-mono text-sm text-navy">
          Paid deed {paidDate} → {window.closedAfter} through {window.closedBefore}
        </p>
        <p className="mt-1 font-mono text-xs text-slate">
          Quitclaim card date 09/12/2016 would have searched{" "}
          {quitclaimWindow.closedAfter}–{quitclaimWindow.closedBefore} and missed
          the 10/31/2014 close.
        </p>
      </section>

      <section className="rounded-2xl border border-charcoal/[0.08] bg-white px-5 py-4">
        <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-gold">
          StreetNumber hops Find sends
        </p>
        {hops.length === 0 ? (
          <p className="mt-2 font-mono text-sm text-slate">No structured hop.</p>
        ) : (
          <ol className="mt-3 space-y-2">
            {hops.map((streetNumber, index) => (
              <li key={streetNumber} className="font-mono text-sm text-navy">
                <span className="text-slate/60">{index + 1}. </span>
                (StreetNumber={streetNumber}) plus the Closed window. Street
                name is matched after RETS returns.
              </li>
            ))}
          </ol>
        )}
        <p className="mt-3 font-mono text-xs text-slate">
          {skipUnparsed
            ? "Letter house — UnparsedAddress is skipped (blank on 99065198). StreetNumber+StreetName is 20206 on SmartMLS."
            : `UnparsedAddress hops: ${unparsed.join(" · ")}`}
        </p>
      </section>

      <section className="rounded-2xl border border-charcoal/[0.08] bg-white px-5 py-4">
        <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-gold">
          Match vs MLS street
        </p>
        <label className="mt-3 block">
          <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-slate">
            MLS street
          </span>
          <input
            value={mlsStreet}
            onChange={(event) => setMlsStreet(event.target.value)}
            className="mt-1 w-full rounded-xl border border-charcoal/[0.1] bg-cream px-3 py-2 font-mono text-sm text-navy"
          />
        </label>
        <p className="mt-3 font-mono text-sm text-navy">
          {matches ? "Match" : "No match"} ·{" "}
          {diverge.diverge ? "spellings differ (FYI on Find)" : "same spelling"}
        </p>
      </section>

      <section className="rounded-2xl border border-charcoal/[0.08] bg-white px-5 py-4">
        <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-gold">
          Live RETS (read-only)
        </p>
        <p className="mt-2 text-sm leading-relaxed text-slate">
          Runs the hops above against SmartMLS. Does not write listings. Works
          on a deploy that has RETS credentials — this planner still works
          without them.
        </p>
        <button
          type="button"
          onClick={() => void runProbe()}
          disabled={busy || hops.length === 0}
          className="mt-3 rounded-full bg-navy px-4 py-2 font-mono text-[11px] uppercase tracking-[0.14em] text-white disabled:opacity-40"
        >
          {busy ? "Probing…" : "Probe RETS"}
        </button>
        {probe ? (
          <div className="mt-4 space-y-3">
            {!probe.configured ? (
              <p className="font-mono text-sm text-slate">
                {probe.message || "RETS is not configured here."}
              </p>
            ) : (
              probe.hops?.map((row) => (
                <div key={row.label}>
                  <p className="font-mono text-[11px] text-navy">
                    {row.label} · {row.count} hit{row.count === 1 ? "" : "s"}
                    {row.error ? ` · ${row.error}` : ""}
                  </p>
                  {row.hits.map((hit) => (
                    <p key={hit.mlsId} className="font-mono text-[11px] text-slate">
                      {hit.mlsId} · {hit.status} · {hit.street || "(no street)"} ·
                      Unparsed={hit.unparsed || "blank"}
                    </p>
                  ))}
                </div>
              ))
            )}
          </div>
        ) : null}
      </section>
    </div>
  );
}
