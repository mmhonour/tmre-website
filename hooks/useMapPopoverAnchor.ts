"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/** Hide this long after the pointer leaves, so a slow first paint still lands. */
const HIDE_DELAY_MS = 1_600;
/** A tapped map stays this long after it paints — the countdown starts on settle,
 *  never on the tap, so a slow boundary fetch cannot eat the whole look. */
const VISIBLE_MS = 4_000;
/** Hard cap for a tapped map that never resolves. */
const MAX_OPEN_MS = 9_000;
/** Matches the popover's opacity transition. */
const FADE_MS = 300;

/**
 * Anchor state for the zip/town boundary popover.
 *
 * Hover opens and closes it on desktop. Touch has no hover to rest in — the
 * browser's synthetic one expires long before a fetched boundary can paint — so
 * a tap opens the map and it dismisses itself once it has been visible long
 * enough to read. Tapping again, tapping away, or Escape closes it early.
 */
export function useMapPopoverAnchor(
  options: { hideDelayMs?: number; visibleMs?: number } = {},
) {
  const hideDelayMs = options.hideDelayMs ?? HIDE_DELAY_MS;
  const visibleMs = options.visibleMs ?? VISIBLE_MS;

  const anchorRef = useRef<HTMLSpanElement>(null);
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const [exiting, setExiting] = useState(false);

  /** Ref, not state: `onSettled` fires from a child effect and must read the
   *  mode set by the same tap that mounted the popover. */
  const timedRef = useRef(false);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const maxTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fadeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimers = useCallback(() => {
    for (const timer of [hideTimer, dismissTimer, maxTimer, fadeTimer]) {
      if (timer.current) clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);

  const close = useCallback(() => {
    clearTimers();
    timedRef.current = false;
    setExiting(false);
    setAnchorEl(null);
  }, [clearTimers]);

  const fadeOut = useCallback(() => {
    clearTimers();
    setExiting(true);
    fadeTimer.current = setTimeout(close, FADE_MS);
  }, [clearTimers, close]);

  const open = useCallback(() => {
    clearTimers();
    timedRef.current = false;
    setExiting(false);
    setAnchorEl(anchorRef.current);
  }, [clearTimers]);

  const scheduleClose = useCallback(() => {
    if (timedRef.current) return;
    clearTimers();
    hideTimer.current = setTimeout(fadeOut, hideDelayMs);
  }, [clearTimers, fadeOut, hideDelayMs]);

  const toggle = useCallback(() => {
    if (anchorEl) {
      close();
      return;
    }
    clearTimers();
    timedRef.current = true;
    setExiting(false);
    setAnchorEl(anchorRef.current);
    maxTimer.current = setTimeout(fadeOut, MAX_OPEN_MS);
  }, [anchorEl, clearTimers, close, fadeOut]);

  /** The popover reports that its boundary resolved (or failed) — start the clock. */
  const notifySettled = useCallback(() => {
    if (!timedRef.current || dismissTimer.current) return;
    dismissTimer.current = setTimeout(fadeOut, visibleMs);
  }, [fadeOut, visibleMs]);

  useEffect(() => () => clearTimers(), [clearTimers]);

  useEffect(() => {
    if (!anchorEl) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (target && anchorRef.current?.contains(target)) return;
      close();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [anchorEl, close]);

  return {
    anchorRef,
    anchorEl,
    isOpen: Boolean(anchorEl),
    exiting,
    open,
    close,
    scheduleClose,
    toggle,
    notifySettled,
  };
}
