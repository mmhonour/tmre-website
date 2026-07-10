import OpenHousesClient from "./OpenHousesClient";
import { TMRE_PROPERTIES_TOWNS_LABEL } from "@/lib/tmre-towns";

export const metadata = {
  title: "Open Houses — TMRE",
  description:
    `Upcoming open houses across ${TMRE_PROPERTIES_TOWNS_LABEL}, CT — public showings in the next 7 days.`,
};

export default function OpenHousesPage() {
  return <OpenHousesClient />;
}
