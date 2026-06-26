import NewConstructionClient from "./NewConstructionClient";

export const metadata = {
  title: "New Construction — TMRE",
  description:
    "New construction homes across Norwalk, Westport, and Fairfield, CT. Sourced live from SmartMLS and scored by TMRE.",
};

export default function PropertiesPage() {
  return <NewConstructionClient />;
}
