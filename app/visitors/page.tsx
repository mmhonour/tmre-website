import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Visitors — TMRE",
  description: "Website visitor activity and location log.",
};

/** Legacy URL — Visitors log now lives under Admin → Visitors. */
export default function VisitorsPage() {
  redirect("/admin?tab=visitors");
}
