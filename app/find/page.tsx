import FindClient from "./FindClient";
import { TMRE_TOWNS_LABEL } from "@/lib/tmre-towns";

export const metadata = {
  title: "Find — TMRE",
  description:
    `Search active listings by address, street, MLS number, or zip across ${TMRE_TOWNS_LABEL}.`,
};

export default function FindPage() {
  return <FindClient />;
}
