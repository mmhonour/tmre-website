import AdminVisitorsZipPreviewClient from "./AdminVisitorsZipPreviewClient";
import {
  ADMIN_VISITORS_ZIP_FIXTURES,
  ADMIN_VISITORS_ZIP_LABELS,
} from "./fixtures";
import { visitorIsAdmin, visitorIsIdentified } from "@/lib/visitors-types";

export const metadata = {
  title: "Preview — Admin visitors ZIP — TMRE",
  robots: { index: false, follow: false },
};

export default function AdminVisitorsZipPreviewPage() {
  const visitors = ADMIN_VISITORS_ZIP_FIXTURES;
  const adminHits = visitors.filter(visitorIsAdmin).length;
  return (
    <AdminVisitorsZipPreviewClient
      visitors={visitors}
      propertyLabels={ADMIN_VISITORS_ZIP_LABELS}
      stats={{
        visitors: visitors.length,
        strangers: visitors.length - adminHits,
        admin: adminHits,
        identified: visitors.filter(visitorIsIdentified).length,
        withPhone: visitors.filter((v) => Boolean(v.phone)).length,
        pageviews: visitors.reduce((sum, v) => sum + (v.pageviews || 0), 0),
      }}
    />
  );
}
