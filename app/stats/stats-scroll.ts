"use client";

import { useEffect } from "react";

/** Breathing room between the header's bottom edge and whatever we scroll to. */
const GUTTER_PX = 12;
/** Used before the header can be measured, and as the CSS fallback. */
const FALLBACK_PX = 112;

/**
 * The site header is fixed with no spacer beneath it, and its height changes
 * with the signed-in chrome, so a fixed scroll-margin cannot reliably clear it.
 * Measure the live header instead.
 */
export function statsScrollOffsetPx(): number {
  if (typeof document === "undefined") return FALLBACK_PX;
  const header = document.querySelector("header");
  const bottom = header?.getBoundingClientRect().bottom ?? 0;
  return (bottom > 0 ? bottom : FALLBACK_PX) + GUTTER_PX;
}

/**
 * Publishes the measured offset so anchors can claim it through
 * `scroll-mt-[var(--stats-scroll-offset,7rem)]`, which is what catches plain
 * `#hash` navigation that never reaches our own scroll helper.
 */
export function useStatsScrollOffset(): void {
  useEffect(() => {
    const root = document.documentElement;
    const update = () => {
      root.style.setProperty(
        "--stats-scroll-offset",
        `${statsScrollOffsetPx()}px`,
      );
    };
    update();
    window.addEventListener("resize", update);
    const header = document.querySelector("header");
    const observer = header ? new ResizeObserver(update) : null;
    if (header && observer) observer.observe(header);
    return () => {
      window.removeEventListener("resize", update);
      observer?.disconnect();
    };
  }, []);
}

/**
 * Scroll a chart (or table) to just below the header.
 *
 * Charts show a short loading skeleton and only grow their title block once
 * their own request lands, so a single scroll fired at click time aims at a
 * box that is about to get taller and leaves the heading tucked under the
 * header. Re-aim while the target keeps resizing, and give up the moment the
 * visitor scrolls for themselves so we never fight them for the page.
 */
export function scrollToStatsAnchor(el: HTMLElement, settleMs = 2500): void {
  let done = false;

  const aim = () => {
    const top =
      el.getBoundingClientRect().top + window.scrollY - statsScrollOffsetPx();
    window.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
  };

  const stop = () => {
    done = true;
    window.removeEventListener("wheel", stop);
    window.removeEventListener("touchmove", stop);
    window.removeEventListener("keydown", stop);
  };
  window.addEventListener("wheel", stop, { passive: true });
  window.addEventListener("touchmove", stop, { passive: true });
  window.addEventListener("keydown", stop);

  aim();

  const startedAt = Date.now();
  let lastHeight = el.offsetHeight;
  const settle = () => {
    if (done) return;
    if (Date.now() - startedAt > settleMs) {
      stop();
      return;
    }
    if (el.offsetHeight !== lastHeight) {
      lastHeight = el.offsetHeight;
      aim();
    }
    window.setTimeout(settle, 150);
  };
  window.setTimeout(settle, 150);
}

/** Tailwind class every stats jump target uses, so the offset stays in one place. */
export const STATS_SCROLL_MT = "scroll-mt-[var(--stats-scroll-offset,7rem)]";
