/**
 * Netlify deploy id + build time for Admin chrome.
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

/** Read current deploy/build identity from Netlify (or local) env. */
export function readDeployBuildInfo(): DeployBuildInfo | null {
  const id =
    process.env.DEPLOY_ID?.trim() ||
    process.env.NETLIFY_DEPLOY_ID?.trim() ||
    process.env.BUILD_ID?.trim() ||
    process.env.COMMIT_REF?.trim() ||
    null;
  if (!id) return null;

  const builtAt = parseDeployIdBuildTime(id);
  return {
    id,
    shortId: id.length > 12 ? id.substring(0, 12) : id,
    builtAt,
    builtAtLabel: builtAt ? formatBuildTime(builtAt) : null,
  };
}
