"use client";

import { useMemo } from "react";
import ZipBoundaryPopover, {
  prefetchZipBoundaries,
} from "@/components/ZipBoundaryPopover";
import { useMapPopoverAnchor } from "@/hooks/useMapPopoverAnchor";
import { isTmreTown, resolveListingTown, zipsForTown } from "@/lib/tmre-towns";

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
  const {
    anchorRef,
    anchorEl,
    isOpen,
    exiting,
    open,
    scheduleClose,
    toggle,
    notifySettled,
  } = useMapPopoverAnchor();

  const contextZips = useMemo(() => {
    const town = townName ? resolveListingTown(townName) : null;
    if (!town || !isTmreTown(town)) return [];
    return zipsForTown(town).filter((z) => z !== zip);
  }, [townName, zip]);

  const warm = () => prefetchZipBoundaries([zip, ...contextZips]);

  const show = () => {
    warm();
    open();
  };

  return (
    <>
      <span
        ref={anchorRef}
        className={`cursor-help underline decoration-charcoal/25 decoration-dotted underline-offset-2 hover:text-navy ${className}`}
        onMouseEnter={show}
        onMouseLeave={scheduleClose}
        onFocus={show}
        onBlur={scheduleClose}
        onClick={() => {
          warm();
          toggle();
        }}
        tabIndex={0}
        role="button"
        aria-expanded={isOpen}
        aria-label={`${isOpen ? "Hide" : "Show"} map for zip ${zip}`}
      >
        {zip}
      </span>
      {anchorEl ? (
        <ZipBoundaryPopover
          highlightZip={zip}
          contextZips={contextZips}
          anchorEl={anchorEl}
          exiting={exiting}
          onSettled={notifySettled}
        />
      ) : null}
    </>
  );
}
