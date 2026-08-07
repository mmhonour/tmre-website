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
    fineHover,
    open,
    scheduleClose,
    toggle,
    notifySettled,
  } = useMapPopoverAnchor();

  if (!town) {
    return <span className={className}>{children ?? townName}</span>;
  }

  const warm = () => prefetchTownBoundaries(town);

  const show = () => {
    warm();
    open();
  };

  return (
    <>
      <span
        ref={anchorRef}
        className={`cursor-help underline decoration-charcoal/25 decoration-dotted underline-offset-2 hover:text-navy ${className}`}
        onPointerDown={(event) => {
          // Nested inside sticky collapse buttons on Latest — keep the map
          // tap from also collapsing the group.
          event.stopPropagation();
          warm();
        }}
        onMouseEnter={fineHover ? show : undefined}
        onMouseLeave={fineHover ? scheduleClose : undefined}
        onFocus={fineHover ? show : undefined}
        onBlur={fineHover ? scheduleClose : undefined}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          warm();
          toggle();
        }}
        tabIndex={0}
        role="button"
        aria-expanded={isOpen || exiting}
        aria-label={`${isOpen || exiting ? "Hide" : "Show"} map for ${town}`}
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
