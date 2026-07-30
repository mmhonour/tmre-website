"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef } from "react";

/**
 * The query string is included because /spotlight serves every featured
 * property from one path and identifies the property with `?property=`; without
 * it, all spotlight views collapse into a single unattributable row.
 */
function VisitorBeaconInner() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const lastSent = useRef<string | null>(null);

  useEffect(() => {
    if (!pathname) return;
    const property = searchParams.get("property");
    const path = property ? `${pathname}?property=${property}` : pathname;
    if (lastSent.current === path) return;
    lastSent.current = path;
    fetch("/api/visitor/log", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path }),
      credentials: "same-origin",
      keepalive: true,
    }).catch(() => {
      // beacon is best-effort
    });
  }, [pathname, searchParams]);

  return null;
}

export default function VisitorBeacon() {
  return (
    <Suspense fallback={null}>
      <VisitorBeaconInner />
    </Suspense>
  );
}
