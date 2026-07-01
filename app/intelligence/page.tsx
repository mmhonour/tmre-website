import IntelligenceClient from "@/components/IntelligenceClient";
import { TMRE_CORE_TOWNS_LABEL } from "@/lib/tmre-towns";

export const metadata = {
  title: "Market Intelligence — TMRE",
  description:
    `Live deal board and snapshot for ${TMRE_CORE_TOWNS_LABEL}, CT. Every listing scored against our proprietary deal model.`,
};

export default function IntelligencePage() {
  return <IntelligenceClient />;
}
