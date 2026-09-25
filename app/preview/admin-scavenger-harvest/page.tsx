import AdminScavengerHarvestPreviewClient from "./AdminScavengerHarvestPreviewClient";

export const metadata = {
  title: "Preview — R2 scavenger harvest — TMRE",
  robots: { index: false, follow: false },
};

export default function AdminScavengerHarvestPreviewPage() {
  return <AdminScavengerHarvestPreviewClient />;
}
