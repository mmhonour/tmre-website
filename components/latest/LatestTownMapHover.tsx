"use client";

import { type ReactNode } from "react";
import ZipBoundaryPopover, {
  prefetchTownBoundaries,
} from "@/components/ZipBoundaryPopover";
import { useMapPopoverAnchor } from "@/hooks/useMapPopoverAnchor";
import { resolveListingTown } from "@/lib/tmre-towns";

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

  if (!town) {
    return <span className={className}>{children ?? townName}</span>;
  }

  const show = () => {
    prefetchTownBoundaries(town);
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
          prefetchTownBoundaries(town);
          toggle();
        }}
        tabIndex={0}
        role="button"
        aria-expanded={isOpen}
        aria-label={`${isOpen ? "Hide" : "Show"} map for ${town}`}
      >
        {children ?? townName}
      </span>
      {anchorEl ? (
        <ZipBoundaryPopover
          highlightTown={town}
          anchorEl={anchorEl}
          exiting={exiting}
          onSettled={notifySettled}
        />
      ) : null}
    </>
  );
}
