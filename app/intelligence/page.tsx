import IntelligenceClient from "@/components/IntelligenceClient";

export const metadata = {
  title: "Market Intelligence — TMRE",
  description:
    "Live deal board and snapshot for Norwalk, Westport, Wilton, and Fairfield, CT. Every listing scored against our proprietary deal model.",
};

export default function IntelligencePage() {
  return <IntelligenceClient />;
}
