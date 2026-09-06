import FindClient from "./FindClient";

export const metadata = {
  title: "Find — Westport Lookup — TMRE",
  description:
    "Look up any Westport parcel by owner, street address, mailing address, MBLU, or Vision PID. On-market listings merge MLS with Vision; off-market parcels open a property page.",
};

export default async function FindPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string | string[] }>;
}) {
  const { q } = await searchParams;
  const initialQuery = Array.isArray(q) ? (q[0] ?? "") : (q ?? "");
  return <FindClient initialQuery={initialQuery} />;
}
