import Link from "next/link";
import AdminSpotlightPrivacyPanel from "@/components/admin/AdminSpotlightPrivacyPanel";

const SPOTLIGHT_TABS = [
  { label: "Spotlight 1", href: "/spotlight", note: "Coming Soon — 42 Treadwell" },
  { label: "Spotlight 2", href: "/spotlight?property=2", note: "11 Treadwell Avenue" },
  { label: "Spotlight 3", href: "/spotlight?property=3", note: "87 Kings Highway South" },
];

export default function AdminSpotlightSitePanel() {
  return (
    <div className="space-y-6">
      <div
        id="admin-spotlight-pages"
        className="scroll-mt-24 overflow-hidden rounded-2xl border border-charcoal/[0.08] bg-white shadow-sm shadow-charcoal/[0.04]"
      >
        <div className="border-b border-charcoal/[0.08] bg-cream/40 px-5 py-4 sm:px-6">
          <p className="font-mono text-[11px] tracking-[0.2em] uppercase text-gold">
            Spotlight properties
          </p>
          <p className="mt-1 text-sm text-charcoal/65">
            Config lives in{" "}
            <code className="font-mono text-[11px] text-navy">lib/spotlight-listing.ts</code>.
            Privacy overrides below apply on top of defaults.
          </p>
        </div>
        <ul className="divide-y divide-charcoal/[0.08]">
          {SPOTLIGHT_TABS.map((tab) => (
            <li key={tab.href}>
              <Link
                href={tab.href}
                className="flex flex-col gap-1 px-5 py-4 transition-colors hover:bg-cream/30 sm:px-6"
              >
                <span className="font-mono text-[11px] tracking-[0.12em] uppercase text-navy">
                  {tab.label}
                </span>
                <span className="text-sm text-charcoal/65">{tab.note}</span>
                <span className="font-mono text-[10px] text-charcoal/40">{tab.href}</span>
              </Link>
            </li>
          ))}
        </ul>
      </div>

      <div id="admin-spotlight" className="scroll-mt-24">
        <AdminSpotlightPrivacyPanel />
      </div>
    </div>
  );
}
