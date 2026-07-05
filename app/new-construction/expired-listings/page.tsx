import ExpiredListingsClient from "./ExpiredListingsClient";
import { TMRE_PROPERTIES_TOWNS_LABEL } from "@/lib/tmre-towns";

export const metadata = {
  title: "Expired Listings — TMRE",
  description:
    `Expired MLS listings across ${TMRE_PROPERTIES_TOWNS_LABEL}, CT — off-market for 30+ days. Sourced live from SmartMLS.`,
};

export default function ExpiredListingsPage() {
  return <ExpiredListingsClient />;
}
