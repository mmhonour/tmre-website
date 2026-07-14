import TownBudgetClient from "./TownBudgetClient";

export const metadata = {
  title: "Town Budget — Westport, Norwalk & Fairfield CT | TMRE",
  description:
    "FY 2026–2027 municipal budgets for Westport, Norwalk, and Fairfield CT — mill rate, revenues, expenditures, and the property tax calendar.",
};

export default function TownBudgetPage() {
  return <TownBudgetClient />;
}
