/**
 * Netlify deploy id + build time for Admin chrome.
 *
 * DEPLOY_ID / BUILD_ID exist at Netlify *build* time but are not injected into
 * Next.js function runtime. Bake them via NEXT_PUBLIC_* in `build:netlify`
 * (see package.json) so SSR + the nav badge can read them after deploy.
 *
 * Deploy ids are hex; the first 8 chars encode a unix timestamp (seconds).
 */

export type DeployBuildInfo = {
  /** Full deploy / build id hex. */
  id: string;
  /** Short display form (first 12 chars). */
  shortId: string;
  /** Parsed from the deploy-id prefix when available. */
  builtAt: Date | null;
  /** Formatted builtAt for display. */
  builtAtLabel: string | null;
};

function parseDeployIdBuildTime(deployId: string): Date | null {
  if (deployId.length < 8) return null;
  // Git SHAs are hex too — reject anything that isn't a Netlify-style id length
  // or that doesn't decode to a plausible unix-seconds timestamp.
  if (!/^[0-9a-f]+$/i.test(deployId)) return null;
  const ts = parseInt(deployId.substring(0, 8), 16);
  if (!Number.isFinite(ts) || ts <= 0) return null;
  const date = new Date(ts * 1000);
  // Guard against nonsense timestamps (before 2015 / after ~2100).
  const year = date.getUTCFullYear();
  if (year < 2015 || year > 2100) return null;
  return date;
}

function formatBuildTime(date: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(date);
}

function firstEnv(...keys: string[]): string | null {
  for (const key of keys) {
    const v = process.env[key]?.trim();
    if (v) return v;
  }
  return null;
}

/** Read current deploy/build identity from Netlify (or local) env. */
export function readDeployBuildInfo(): DeployBuildInfo | null {
  // Prefer baked NEXT_PUBLIC_* (available after Netlify build) then live shell
  // vars (local `netlify dev` / function runtime when present).
  const id = firstEnv(
    "NEXT_PUBLIC_DEPLOY_ID",
    "NEXT_PUBLIC_BUILD_ID",
    "DEPLOY_ID",
    "NETLIFY_DEPLOY_ID",
    "BUILD_ID",
    "NEXT_PUBLIC_COMMIT_REF",
    "COMMIT_REF",
  );
  if (!id) return null;

  const builtAt = parseDeployIdBuildTime(id);
  return {
    id,
    shortId: id.length > 12 ? id.substring(0, 12) : id,
    builtAt,
    builtAtLabel: builtAt ? formatBuildTime(builtAt) : null,
  };
}
