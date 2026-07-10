"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import ZipBoundaryPopover, {
  prefetchZipBoundaries,
} from "@/components/ZipBoundaryPopover";
import {
  isTmreTown,
  resolveListingTown,
  zipsForTown,
} from "@/lib/tmre-towns";

/** Show zip map immediately; hide 1s after pointer leaves. */
const ZIP_MAP_HIDE_DELAY_MS = 1_000;

type LatestZipMapHoverProps = {
  zip: string;
  townName: string | null;
  className?: string;
};

export default function LatestZipMapHover({
  zip,
  townName,
  className = "",
}: LatestZipMapHoverProps) {
  const anchorRef = useRef<HTMLSpanElement>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);

  const contextZips = useMemo(() => {
    const town = townName ? resolveListingTown(townName) : null;
    if (!town || !isTmreTown(town)) return [];
    return zipsForTown(town).filter((z) => z !== zip);
  }, [townName, zip]);

  const clearHideTimer = () => {
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  };

  const show = () => {
    clearHideTimer();
    prefetchZipBoundaries([zip, ...contextZips]);
    setAnchorEl(anchorRef.current);
  };

  const scheduleHide = () => {
    clearHideTimer();
    hideTimerRef.current = setTimeout(() => {
      setAnchorEl(null);
    }, ZIP_MAP_HIDE_DELAY_MS);
  };

  useEffect(() => () => clearHideTimer(), []);

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
        aria-label={`Show map for zip ${zip}`}
      >
        {zip}
      </span>
      {anchorEl ? (
        <ZipBoundaryPopover
          highlightZip={zip}
          contextZips={contextZips}
          anchorEl={anchorEl}
        />
      ) : null}
    </>
  );
}
