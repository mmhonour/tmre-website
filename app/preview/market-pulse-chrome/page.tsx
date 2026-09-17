import MarketPulseChromePreviewClient from "./MarketPulseChromePreviewClient";

export const metadata = {
  title: "Preview — Market Pulse chrome — TMRE",
  robots: { index: false, follow: false },
};

export default function MarketPulseChromePreviewPage() {
  return <MarketPulseChromePreviewClient />;
}
