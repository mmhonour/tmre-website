import type { DeployBuildInfo } from "@/lib/deploy-build-info";

/** Compact build stamp for the nav when Admin is unlocked. */
export default function AdminBuildBadge({
  build,
  className = "",
}: {
  build: DeployBuildInfo;
  className?: string;
}) {
  const title = [
    build.builtAtLabel ? `Built ${build.builtAtLabel}` : null,
    `Deploy ${build.id}`,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div
      className={`text-right select-none leading-none ${className}`}
      title={title}
      aria-label={title}
    >
      <p className="font-mono text-[8px] tracking-[0.16em] uppercase text-white/40 mb-0.5">
        Build
      </p>
      {build.builtAtLabel ? (
        <p className="font-mono text-[9px] text-white/70 whitespace-nowrap">
          {build.builtAtLabel}
        </p>
      ) : null}
      <p className="font-mono text-[9px] text-gold/75 mt-0.5 whitespace-nowrap">
        {build.shortId}
        {build.id.length > 12 ? "…" : ""}
      </p>
    </div>
  );
}
