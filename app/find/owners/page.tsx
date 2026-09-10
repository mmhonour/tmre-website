import Link from "next/link";
import { listVisionOwnerPortfolios } from "@/lib/db/vision-owner-clusters-repo";
import { westportParcelHref } from "@/lib/listing-url";
import type { VisionOwnerPortfolio } from "@/lib/vision-owner-keys";

export const dynamic = "force-dynamic";

const TOWN = "Westport";

export const metadata = {
  title: "Owners with 2+ homes — Westport Lookup — TMRE",
  description:
    "Westport Vision cards that share a mailing or owner name — two or more homes, largest first.",
};

async function loadPortfolios(): Promise<VisionOwnerPortfolio[]> {
  try {
    return await listVisionOwnerPortfolios({ town: TOWN, minParcels: 2 });
  } catch (err) {
    console.warn("[find/owners] load failed", err);
    return [];
  }
}

export default async function FindOwnersPage() {
  const portfolios = await loadPortfolios();

  return (
    <>
      <section className="navy-gradient text-white pt-20 pb-8 lg:pt-24 lg:pb-10 relative overflow-hidden">
        <div className="absolute inset-0 hero-grid opacity-40" aria-hidden />
        <div className="relative mx-auto max-w-7xl px-6 lg:px-10">
          <p className="font-mono text-[11px] tracking-[0.2em] uppercase text-gold mb-3">
            <Link href="/find" className="hover:text-white transition-colors">
              Find · Westport
            </Link>
            {" · "}
            Owners
          </p>
          <h1 className="font-serif text-4xl sm:text-5xl text-white leading-[1.08] max-w-3xl">
            Owners with two or more homes
          </h1>
          <p className="mt-3 max-w-xl font-mono text-sm text-white/70">
            Largest portfolios first. Same mailbox or the same assessor name
            across Vision cards. Westport only for now.
          </p>
        </div>
      </section>
      <section className="bg-cream py-10 lg:py-14">
        <div className="mx-auto max-w-7xl px-6 lg:px-10">
          {portfolios.length === 0 ? (
            <p className="font-mono text-sm text-slate/70">
              No 2+ home clusters yet. Open Find parcels or run{" "}
              <span className="text-navy">npm run sync:owner-clusters</span>{" "}
              so keys are written.
            </p>
          ) : (
            <ol className="space-y-5">
              {portfolios.map((row) => (
                <li
                  key={row.clusterId}
                  className="rounded-2xl border border-charcoal/[0.08] bg-white px-5 py-4"
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-3">
                    <h2 className="font-serif text-2xl text-navy">
                      {row.displayName}
                    </h2>
                    <p className="font-mono text-[11px] tracking-[0.1em] uppercase text-slate">
                      {row.parcelCount}{" "}
                      {row.parcelCount === 1 ? "home" : "homes"}
                      {row.clusterKind === "mailing" ? " · same mailing" : ""}
                    </p>
                  </div>
                  {row.mailingLabel ? (
                    <p className="mt-1 font-mono text-[12px] text-slate/70">
                      {row.mailingLabel}
                    </p>
                  ) : null}
                  <ul className="mt-3 space-y-1">
                    {row.parcels.map((parcel) => (
                      <li key={`${parcel.town}:${parcel.visionPid}`}>
                        <Link
                          href={westportParcelHref(parcel.visionPid)}
                          className="font-mono text-sm text-navy hover:underline"
                        >
                          {parcel.siteAddress}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ol>
          )}
        </div>
      </section>
    </>
  );
}
