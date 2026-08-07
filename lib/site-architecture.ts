/**
 * Visual inventory for Admin → Architecture → Site architecture.
 * Evidence-based roles — GoDaddy/Cloudflare DNS are edge assumptions outside app code.
 */

export type SiteArchNodeKind = "core" | "optional" | "edge" | "client";

export type SiteArchNode = {
  id: string;
  label: string;
  role: string;
  kind: SiteArchNodeKind;
  /** Shown under the node when useful. */
  note?: string;
};

export type SiteArchEdge = {
  from: string;
  to: string;
  label?: string;
};

export const SITE_ARCH_NODES: SiteArchNode[] = [
  {
    id: "visitors",
    label: "Visitors",
    role: "Browsers on the public site",
    kind: "client",
  },
  {
    id: "godaddy",
    label: "GoDaddy",
    role: "Domain registrar / DNS (typical)",
    kind: "edge",
    note: "Not referenced in app code — include if this is where tmre.com is registered",
  },
  {
    id: "cloudflare-edge",
    label: "Cloudflare",
    role: "DNS / CDN / proxy (if enabled)",
    kind: "edge",
    note: "App code uses Cloudflare R2 for photos; DNS/CDN is configured outside the repo",
  },
  {
    id: "netlify",
    label: "Netlify",
    role: "Next.js host, serverless functions, crons, Blobs",
    kind: "core",
    note:
      "Lane 3: site-cache warm + digests (sideWorkOnly after Railway handoff). Not the preferred Incremental RETS puller — that is Railway mls-sync.",
  },
  {
    id: "railway",
    label: "Railway mls-sync",
    role: "Always-on Incremental RETS → Neon puller",
    kind: "core",
    note:
      "Lane 1: RETS pull only (MLS_SYNC_SERVICE=1, postHooks:false). Lane 2 handoff is the Neon End/heartbeat write. Queues Netlify sideWorkOnly for Lane 3 warm.",
  },
  {
    id: "eventbridge",
    label: "AWS EventBridge",
    role: "Optional sync alarm clock (Scheduler)",
    kind: "optional",
    note:
      "Legacy side-by-side with Netlify cron. Prefer Configure → Incremental → Railway. Hits eventbridge-sync-ingress with SYNC_CRON_SECRET.",
  },
  {
    id: "neon",
    label: "Neon Postgres",
    role: "Listings, sync_meta, stats_cache, visitors, alerts",
    kind: "core",
    note:
      "Lane 2 handoff — inventory truth for Netlify + local. Shared when DATABASE_URL points here. Website never needs Railway up to know what’s listed.",
  },
  {
    id: "rets",
    label: "SmartMLS RETS",
    role: "MLS listings, photos metadata, history",
    kind: "core",
    note: "Pulled by Railway mls-sync (preferred). Netlify worker RETS is legacy/fallback.",
  },
  {
    id: "r2",
    label: "Cloudflare R2",
    role: "Listing photo object storage",
    kind: "core",
    note: "S3-compatible; preferred photo backend when env is set",
  },
  {
    id: "blobs",
    label: "Netlify Blobs",
    role: "Legacy photo checkpoint / sync progress",
    kind: "optional",
  },
  {
    id: "resend",
    label: "Resend",
    role: "Contact, market digest, deploy email, search alerts",
    kind: "core",
  },
  {
    id: "twilio",
    label: "Twilio",
    role: "Deploy-notify SMS",
    kind: "optional",
  },
  {
    id: "census",
    label: "Census TIGERweb",
    role: "Zip / ZCTA boundary rings",
    kind: "core",
  },
  {
    id: "osm",
    label: "OpenStreetMap",
    role: "Map tiles (proxied)",
    kind: "core",
  },
  {
    id: "ipapi",
    label: "ipapi.co",
    role: "Visitor IP → town hint",
    kind: "optional",
  },
  {
    id: "vision",
    label: "Vision Appraisal",
    role: "Assessor scrape (owners / addresses)",
    kind: "optional",
  },
  {
    id: "greatschools",
    label: "GreatSchools",
    role: "Live school ratings for scoring",
    kind: "optional",
  },
  {
    id: "openai",
    label: "OpenAI",
    role: "Finish-quality vision / descriptor copy",
    kind: "optional",
  },
];

export const SITE_ARCH_EDGES: SiteArchEdge[] = [
  { from: "visitors", to: "godaddy", label: "DNS lookup" },
  { from: "godaddy", to: "cloudflare-edge", label: "nameservers (if proxied)" },
  { from: "cloudflare-edge", to: "netlify", label: "HTTPS" },
  { from: "visitors", to: "netlify", label: "direct / CDN→origin" },
  {
    from: "eventbridge",
    to: "netlify",
    label: "HTTPS ingress (legacy jobs)",
  },
  { from: "railway", to: "rets", label: "Lane 1 RETS pull" },
  { from: "railway", to: "neon", label: "Lane 2 upsert · End · heartbeat" },
  {
    from: "railway",
    to: "netlify",
    label: "Lane 3 warm handoff (sideWorkOnly)",
  },
  { from: "netlify", to: "neon", label: "SQL · warm caches · digests" },
  { from: "netlify", to: "r2", label: "photos" },
  { from: "netlify", to: "blobs", label: "checkpoint" },
  { from: "netlify", to: "resend", label: "email" },
  { from: "netlify", to: "twilio", label: "SMS" },
  { from: "netlify", to: "census", label: "monthly" },
  { from: "netlify", to: "osm", label: "tiles" },
  { from: "netlify", to: "ipapi", label: "geo" },
  { from: "netlify", to: "vision", label: "scrape" },
  { from: "netlify", to: "greatschools", label: "ratings" },
  { from: "netlify", to: "openai", label: "AI" },
];
