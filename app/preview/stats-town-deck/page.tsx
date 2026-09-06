import StatsTownDeckPreviewClient from "./StatsTownDeckPreviewClient";

export const metadata = {
  title: "Preview — Stats town deck — TMRE",
  robots: { index: false, follow: false },
};

export default function StatsTownDeckPreviewPage() {
  return <StatsTownDeckPreviewClient />;
}
