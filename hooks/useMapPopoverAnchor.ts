"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/** Desktop: hide this long after the pointer leaves (shorter than before so
 *  appear ≫ linger — map should not hang over the pill row). */
const HIDE_DELAY_MS = 700;
/** Touch/tap: how long the map stays after it paints. */
const VISIBLE_MS_TOUCH = 1_800;
/** Desktop hover: longer look once painted (still shorter than the old 4s tap). */
const VISIBLE_MS_HOVER = 2_400;
/** Hard cap if the boundary never settles. */
const MAX_OPEN_MS_TOUCH = 4_500;
const MAX_OPEN_MS_HOVER = 7_000;
/** Popover opacity transition — keep in sync with ZipBoundaryPopover. */
const FADE_MS = 220;

function prefersFineHover(): boolean {
  if (typeof window === "undefined") return true;
  return window.matchMedia("(hover: hover) and (pointer: fine)").matches;
}

/**
 * Anchor state for the zip/town boundary popover.
 *
 * Desktop: hover opens immediately; leave dismisses after a short delay.
 * Touch: tap opens (timed); map fades away soon after it paints — synthetic
 * mouseenter/leave are ignored so iOS doesn’t open-then-orphan the popover.
 */
export function useMapPopoverAnchor(
  options: {
    hideDelayMs?: number;
    visibleMs?: number;
  } = {},
) {
  const hideDelayMs = options.hideDelayMs ?? HIDE_DELAY_MS;

  const anchorRef = useRef<HTMLSpanElement>(null);
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const [exiting, setExiting] = useState(false);
  const [fineHover, setFineHover] = useState(true);

  const timedRef = useRef(false);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const maxTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fadeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setFineHover(prefersFineHover());
    const mq = window.matchMedia("(hover: hover) and (pointer: fine)");
    const onChange = () => setFineHover(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

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
    if (fadeTimer.current) return; // already exiting
    clearTimers();
    setExiting(true);
    fadeTimer.current = setTimeout(close, FADE_MS);
  }, [clearTimers, close]);

  const open = useCallback(() => {
    // Hover open — only meaningful on fine pointers; consumers should gate,
    // but guard anyway so synthetic touch-hover can’t arm the wrong mode.
    if (!prefersFineHover()) return;
    clearTimers();
    timedRef.current = false;
    setExiting(false);
    setAnchorEl(anchorRef.current);
  }, [clearTimers]);

  const scheduleClose = useCallback(() => {
    if (timedRef.current) return;
    if (!prefersFineHover()) return;
    clearTimers();
    hideTimer.current = setTimeout(fadeOut, hideDelayMs);
  }, [clearTimers, fadeOut, hideDelayMs]);

  const toggle = useCallback(() => {
    if (anchorEl && !exiting) {
      fadeOut();
      return;
    }
    if (exiting) return;
    clearTimers();
    timedRef.current = true;
    setExiting(false);
    setAnchorEl(anchorRef.current);
    const maxMs = prefersFineHover() ? MAX_OPEN_MS_HOVER : MAX_OPEN_MS_TOUCH;
    maxTimer.current = setTimeout(fadeOut, maxMs);
  }, [anchorEl, clearTimers, exiting, fadeOut]);

  /**
   * Timed open for a click that also does something else (e.g. a card whose
   * click filters the list). Unlike `toggle` it never closes an already-open
   * map, so a hover that got there first turns into a brief look rather than
   * vanishing on click.
   */
  const flash = useCallback(() => {
    if (fadeTimer.current) return; // mid fade-out — let it finish
    const alreadyPainted = Boolean(anchorEl);
    clearTimers();
    timedRef.current = true;
    setExiting(false);
    setAnchorEl(anchorRef.current);
    maxTimer.current = setTimeout(
      fadeOut,
      prefersFineHover() ? MAX_OPEN_MS_HOVER : MAX_OPEN_MS_TOUCH,
    );
    /**
     * When the map is already up, the boundary will not re-settle, so onSettled
     * never fires again and the look would run to the hard cap. Start the
     * visible clock here; a cold open still waits for paint via notifySettled.
     */
    if (alreadyPainted) {
      dismissTimer.current = setTimeout(
        fadeOut,
        options.visibleMs ??
          (prefersFineHover() ? VISIBLE_MS_HOVER : VISIBLE_MS_TOUCH),
      );
    }
  }, [anchorEl, clearTimers, fadeOut, options.visibleMs]);

  /** Boundary painted or failed — start the auto-dismiss clock for tap mode. */
  const notifySettled = useCallback(() => {
    if (!timedRef.current || dismissTimer.current || fadeTimer.current) return;
    const visibleMs =
      options.visibleMs ??
      (prefersFineHover() ? VISIBLE_MS_HOVER : VISIBLE_MS_TOUCH);
    dismissTimer.current = setTimeout(fadeOut, visibleMs);
  }, [fadeOut, options.visibleMs]);

  useEffect(() => () => clearTimers(), [clearTimers]);

  useEffect(() => {
    if (!anchorEl) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (target && anchorRef.current?.contains(target)) return;
      // Don’t kill a map that’s still fading — let fadeOut finish.
      if (fadeTimer.current) return;
      fadeOut();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") fadeOut();
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [anchorEl, fadeOut]);

  return {
    anchorRef,
    anchorEl,
    isOpen: Boolean(anchorEl) && !exiting,
    exiting,
    /** True when mouse hover should drive open/close (not touch). */
    fineHover,
    open,
    close,
    scheduleClose,
    toggle,
    flash,
    notifySettled,
  };
}
