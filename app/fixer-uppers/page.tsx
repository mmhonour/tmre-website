import FixerUppersClient from "./FixerUppersClient";
import { TMRE_TOWNS_LABEL } from "@/lib/tmre-towns";

export const metadata = {
  title: "Fixer Uppers / Demolitions — TMRE",
  description:
    `Handyman specials, teardowns, and buildable lots across ${TMRE_TOWNS_LABEL} — low price points with acreage to build on.`,
};

export default function FixerUppersPage() {
  return <FixerUppersClient />;
}
