import Link from "next/link";
import { westportParcelHref } from "@/lib/listing-url";
import { pickUniqueOwnerPortfolios } from "@/lib/vision-owner-keys";

export const metadata = {
  title: "Preview — Owner portfolios — TMRE",
  robots: { index: false, follow: false },
};

const TOWN_FIXTURES = pickUniqueOwnerPortfolios([
  {
    clusterId: "mailing:po box 88|westport",
    clusterKind: "mailing",
    town: "Westport",
    displayName: "Albert King",
    relationship: "owner",
    mailingLabel: "po box 88, westport",
    parcelCount: 3,
    parcels: [
      { town: "Westport", visionPid: "1565", siteAddress: "12 Main St" },
      { town: "Westport", visionPid: "200", siteAddress: "40 Compo Rd" },
      { town: "Westport", visionPid: "201", siteAddress: "8 Beachside Ave" },
    ],
  },
  {
    clusterId: "name:king|albert",
    clusterKind: "name",
    town: "Westport",
    displayName: "Albert King",
    relationship: "landlord",
    mailingLabel: null,
    parcelCount: 2,
    parcels: [
      { town: "Westport", visionPid: "1565", siteAddress: "12 Main St" },
      { town: "Westport", visionPid: "200", siteAddress: "40 Compo Rd" },
    ],
  },
  {
    clusterId: "name:denise|penna",
    clusterKind: "name",
    town: "Westport",
    displayName: "Denise Penna",
    relationship: "landlord",
    mailingLabel: null,
    parcelCount: 2,
    parcels: [
      { town: "Westport", visionPid: "4100", siteAddress: "12 Compo Rd S" },
      { town: "Westport", visionPid: "4101", siteAddress: "88 Hillspoint Rd" },
    ],
  },
]);

export default function OwnerPortfoliosPreviewPage() {
  return (
    <div className="min-h-screen bg-cream">
      <div className="mx-auto max-w-3xl px-4 pb-12 pt-28 sm:px-6">
        <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.2em] text-gold">
          UI preview
        </p>
        <h1 className="mb-2 font-serif text-3xl text-navy">
          Owner portfolios (2+ homes)
        </h1>
        <p className="mb-8 text-sm leading-relaxed text-slate">
          Fixture list — largest first. A name on two warranty or
          quitclaim rows is a landlord (Denise Penna). Same mailbox is an
          owner cluster. Production (admin): /streets/owners or Find →
          Landlord / owners.
        </p>
        <p className="mb-8 font-mono text-[11px] tracking-[0.2em] uppercase text-gold">
          Find · Westport · Landlord / owners
        </p>
        <h2 className="mb-3 font-mono text-[11px] uppercase tracking-[0.14em] text-slate">
          Town-wide
        </h2>
        <ol className="mb-10 space-y-5">
          {TOWN_FIXTURES.map((row) => (
            <li
              key={row.clusterId}
              className="rounded-2xl border border-charcoal/[0.08] bg-white px-5 py-4"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-3">
                <h2 className="font-serif text-2xl text-navy">{row.displayName}</h2>
                <p className="font-mono text-[11px] tracking-[0.1em] uppercase text-slate">
                  {row.parcelCount} homes
                  {row.relationship === "landlord"
                    ? " · landlord"
                    : " · same mailing"}
                </p>
              </div>
              <ul className="mt-3 space-y-1">
                {row.parcels.map((parcel) => (
                  <li key={parcel.visionPid}>
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
        <h2 className="mb-3 font-mono text-[11px] uppercase tracking-[0.14em] text-slate">
          On STONY PT RD (2+ on this street)
        </h2>
        <ol className="space-y-5">
          {pickUniqueOwnerPortfolios([
            {
              clusterId: "mailing:2a stony pt rd|westport",
              clusterKind: "mailing",
              town: "Westport",
              displayName: "CASTILLO EDWARD AND SNYDER CAMERON",
              relationship: "owner",
              mailingLabel: "2a stony pt rd, westport",
              parcelCount: 2,
              parcels: [
                {
                  town: "Westport",
                  visionPid: "5384",
                  siteAddress: "2A STONY PT RD",
                },
                {
                  town: "Westport",
                  visionPid: "5385",
                  siteAddress: "2B STONY PT RD",
                },
              ],
            },
          ]).map((row) => (
            <li
              key={row.clusterId}
              className="rounded-2xl border border-charcoal/[0.08] bg-white px-5 py-4"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-3">
                <h2 className="font-serif text-2xl text-navy">{row.displayName}</h2>
                <p className="font-mono text-[11px] tracking-[0.1em] uppercase text-slate">
                  {row.parcelCount} homes on this street
                </p>
              </div>
              <ul className="mt-3 space-y-1">
                {row.parcels.map((parcel) => (
                  <li key={parcel.visionPid}>
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
      </div>
    </div>
  );
}
