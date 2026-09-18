"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef } from "react";
import { useVisitorLocation } from "@/hooks/useVisitorLocation";
import {
  readVisitorPostalOverride,
} from "@/lib/visitor-location";

function postVisitorLog(body: { path?: string; zip?: string }) {
  fetch("/api/visitor/log", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    credentials: "same-origin",
    keepalive: true,
  }).catch(() => {
    // beacon is best-effort
  });
}

function zipFromLocation(
  location: {
    postal: string | null;
    cleared?: boolean;
  } | null,
): string | null {
  if (location?.cleared) return null
  return location?.postal ?? readVisitorPostalOverride()
}

/**
 * The query string is included because /spotlight serves every featured
 * property from one path and identifies the property with `?property=`; without
 * it, all spotlight views collapse into a single unattributable row.
 */
function VisitorBeaconInner() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { location } = useVisitorLocation();
  const lastSentPath = useRef<string | null>(null);
  const lastSentZip = useRef<string | null>(null);

  useEffect(() => {
    if (!pathname) return;
    const property = searchParams.get("property");
    const path = property ? `${pathname}?property=${property}` : pathname;
    const zip = zipFromLocation(location);
    if (lastSentPath.current === path) return;
    lastSentPath.current = path;
    lastSentZip.current = zip;
    postVisitorLog(zip ? { path, zip } : { path });
  }, [pathname, searchParams, location]);

  useEffect(() => {
    const zip = zipFromLocation(location);
    if (!zip || zip === lastSentZip.current) return;
    lastSentZip.current = zip;
    postVisitorLog({ zip });
  }, [location]);

  return null;
}

export default function VisitorBeacon() {
  return (
    <Suspense fallback={null}>
      <VisitorBeaconInner />
    </Suspense>
  );
}
