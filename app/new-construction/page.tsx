import NewConstructionClient from "./NewConstructionClient";
import { TMRE_PROPERTIES_TOWNS_LABEL } from "@/lib/tmre-towns";

export const metadata = {
  title: "New Construction — TMRE",
  description:
    `New construction homes across ${TMRE_PROPERTIES_TOWNS_LABEL}, CT. Sourced live and scored by TMRE.`,
};

export default function NewConstructionPage() {
  return <NewConstructionClient />;
}
