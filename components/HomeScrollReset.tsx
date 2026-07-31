"use client";

import { useEffect } from "react";

/**
 * Mobile hard-refresh often restores a mid-page scrollY, so the homepage hero
 * appears with its top half "off screen". Client navigations already reset to
 * top via the App Router — this covers reload / bfcache restore.
 */
export default function HomeScrollReset() {
  useEffect(() => {
    const prev =
      "scrollRestoration" in history ? history.scrollRestoration : null;
    if ("scrollRestoration" in history) {
      history.scrollRestoration = "manual";
    }

    const pinTop = () => {
      window.scrollTo({ top: 0, left: 0, behavior: "auto" });
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
    };

    pinTop();

    // One follow-up after layout — avoid a burst of scrollTo calls that feel
    // like the hero background is hopping on mobile.
    const raf = window.requestAnimationFrame(() => pinTop());
    const t0 = window.setTimeout(pinTop, 0);

    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) pinTop();
    };
    window.addEventListener("pageshow", onPageShow);

    return () => {
      window.cancelAnimationFrame(raf);
      window.clearTimeout(t0);
      window.removeEventListener("pageshow", onPageShow);
      if (prev != null && "scrollRestoration" in history) {
        history.scrollRestoration = prev;
      }
    };
  }, []);

  return null;
}
