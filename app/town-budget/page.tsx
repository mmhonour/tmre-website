import TownBudgetClient from "./TownBudgetClient";

export const metadata = {
  title: "Town Budget — Westport CT | TMRE",
  description:
    "Westport FY 2026–2027 municipal budget — mill rate, revenues, expenditures, and property tax calendar.",
};

export default function TownBudgetPage() {
  return <TownBudgetClient />;
}
