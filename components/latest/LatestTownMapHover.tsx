"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";
import ZipBoundaryPopover, {
  prefetchTownBoundaries,
} from "@/components/ZipBoundaryPopover";
import { resolveListingTown } from "@/lib/tmre-towns";

/** Show town map immediately; hide 1s after pointer leaves (matches zip hover). */
const TOWN_MAP_HIDE_DELAY_MS = 1_000;

type LatestTownMapHoverProps = {
  townName: string;
  className?: string;
  children?: ReactNode;
};

export default function LatestTownMapHover({
  townName,
  className = "",
  children,
}: LatestTownMapHoverProps) {
  const town = resolveListingTown(townName);
  const anchorRef = useRef<HTMLSpanElement>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);

  const clearHideTimer = () => {
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  };

  const show = () => {
    if (!town) return;
    clearHideTimer();
    prefetchTownBoundaries(town);
    setAnchorEl(anchorRef.current);
  };

  const scheduleHide = () => {
    clearHideTimer();
    hideTimerRef.current = setTimeout(() => {
      setAnchorEl(null);
    }, TOWN_MAP_HIDE_DELAY_MS);
  };

  useEffect(() => () => clearHideTimer(), []);

  if (!town) {
    return <span className={className}>{children ?? townName}</span>;
  }

  return (
    <>
      <span
        ref={anchorRef}
        className={`cursor-help underline decoration-charcoal/25 decoration-dotted underline-offset-2 hover:text-navy ${className}`}
        onMouseEnter={show}
        onMouseLeave={scheduleHide}
        onFocus={show}
        onBlur={scheduleHide}
        onTouchStart={show}
        onTouchEnd={scheduleHide}
        onTouchCancel={scheduleHide}
        tabIndex={0}
        role="button"
        aria-label={`Show map for ${town}`}
      >
        {children ?? townName}
      </span>
      {anchorEl ? (
        <ZipBoundaryPopover highlightTown={town} anchorEl={anchorEl} />
      ) : null}
    </>
  );
}
