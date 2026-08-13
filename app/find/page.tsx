import FindClient from "./FindClient";

export const metadata = {
  title: "Find — Westport Lookup — TMRE",
  description:
    "Look up any Westport address from the town parcel map. On-market listings merge MLS with Vision; off-market parcels open a property page.",
};

export default function FindPage() {
  return <FindClient />;
}
