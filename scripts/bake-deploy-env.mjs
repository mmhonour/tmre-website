/**
 * Bake Netlify build-only deploy identity into Next.js env so Admin SSR + the
 * nav build badge can read them at runtime (DEPLOY_ID is not in function env).
 */
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const outPath = path.join(root, ".env.production.local");

const pairs = [
  ["NEXT_PUBLIC_DEPLOY_ID", process.env.DEPLOY_ID || process.env.NETLIFY_DEPLOY_ID],
  ["NEXT_PUBLIC_BUILD_ID", process.env.BUILD_ID],
  ["NEXT_PUBLIC_COMMIT_REF", process.env.COMMIT_REF],
].filter(([, v]) => typeof v === "string" && v.trim().length > 0);

if (pairs.length === 0) {
  console.info(
    "[bake-deploy-env] no DEPLOY_ID/BUILD_ID/COMMIT_REF in env — skip (local build)",
  );
  process.exit(0);
}

const body =
  pairs.map(([k, v]) => `${k}=${String(v).trim()}`).join("\n") + "\n";

fs.writeFileSync(outPath, body, "utf8");
console.info(
  `[bake-deploy-env] wrote ${path.basename(outPath)} (${pairs
    .map(([k]) => k)
    .join(", ")})`,
);
