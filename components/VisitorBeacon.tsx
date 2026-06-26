"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

export default function VisitorBeacon() {
  const pathname = usePathname();
  const lastSent = useRef<string | null>(null);

  useEffect(() => {
    if (!pathname || lastSent.current === pathname) return;
    lastSent.current = pathname;
    fetch("/api/visitor/log", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: pathname }),
      credentials: "same-origin",
      keepalive: true,
    }).catch(() => {
      // beacon is best-effort
    });
  }, [pathname]);

  return null;
}
