import AdminAlertJobHealth from "@/components/admin/AdminAlertJobHealth";
import AdminListingAlertsPanel, {
  type AdminListingAlertRow,
} from "@/components/admin/AdminListingAlertsPanel";
import type { AlertJobLastRuns } from "@/lib/saved-search-alert-kinds";

export const metadata = {
  title: "Preview — Alert doorbells — TMRE",
  robots: { index: false, follow: false },
};

const FIXTURE_RUNS: AlertJobLastRuns = {
  listing: {
    at: new Date(Date.now() - 25 * 60 * 1000).toISOString(),
    kind: "listing",
    source: "alerts",
    ok: true,
    checked: 12,
    sent: 2,
    listings: 5,
  },
  openHouse: {
    at: new Date(Date.now() - 26 * 60 * 60 * 1000).toISOString(),
    kind: "open_house",
    source: "alerts",
    ok: false,
    checked: 0,
    sent: 0,
    listings: 0,
    error: "open-houses pull failed — RETS timeout",
  },
};

const FIXTURE_ALERTS: AdminListingAlertRow[] = [
  {
    id: "preview-listing-only",
    email: "pat@example.com",
    criteriaLabel: "Westport · sale · listings",
    cadence: "immediate",
    cadenceLabel: "Immediate",
    channel: "email",
    active: true,
    lastNotifiedAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    lastListingNotifiedAt: new Date(
      Date.now() - 2 * 60 * 60 * 1000,
    ).toISOString(),
    lastOpenHouseNotifiedAt: null,
    wantsListing: true,
    wantsOpenHouse: false,
    createdAt: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: "preview-oh-only",
    email: "pat@example.com",
    criteriaLabel: "Westport · open houses",
    cadence: "daily",
    cadenceLabel: "Daily 09:00 ET",
    channel: "email",
    active: true,
    lastNotifiedAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
    lastListingNotifiedAt: null,
    lastOpenHouseNotifiedAt: new Date(
      Date.now() - 30 * 24 * 60 * 60 * 1000,
    ).toISOString(),
    wantsListing: false,
    wantsOpenHouse: true,
    createdAt: new Date(Date.now() - 40 * 24 * 60 * 60 * 1000).toISOString(),
  },
];

export default function AlertJobHealthPreviewPage() {
  return (
    <div className="min-h-screen bg-cream">
      <div className="mx-auto max-w-5xl px-4 pb-12 pt-28 sm:px-6">
        <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.2em] text-gold">
          UI preview
        </p>
        <h1 className="mb-2 font-serif text-3xl text-navy">
          Alert doorbells — Incremental vs Open houses
        </h1>
        <p className="mb-8 text-sm leading-relaxed text-slate">
          Listing mail is Incremental only. Open-house mail is the OH job
          only. Fixture:           Listing side is dirty (Incremental just wrote). OH side failed
          yesterday and is clean. Production: Admin → Communications.
        </p>
        <div className="mb-8">
          <AdminAlertJobHealth
            lastRuns={FIXTURE_RUNS}
            dirty={{
              listing: new Date(Date.now() - 4 * 60 * 1000).toISOString(),
              openHouse: null,
            }}
          />
        </div>
        <AdminListingAlertsPanel
          initial={FIXTURE_ALERTS}
          initialLastRuns={FIXTURE_RUNS}
          initialDirty={{
            listing: new Date(Date.now() - 4 * 60 * 1000).toISOString(),
            openHouse: null,
          }}
        />
      </div>
    </div>
  );
}
