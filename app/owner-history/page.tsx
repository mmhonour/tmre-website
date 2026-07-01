import OwnerHistoryClient from "./OwnerHistoryClient";

export const metadata = {
  title: "Owner History — Westport CT | TMRE",
  description:
    "Recent property owners in Westport, CT — sourced from public tax records.",
};

export default function OwnerHistoryPage() {
  return <OwnerHistoryClient />;
}
