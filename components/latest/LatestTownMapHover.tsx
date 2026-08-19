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
  /**
   * Nested in a control that owns the click (e.g. the Stats card header, whose
   * click filters the list). Hover still opens the map and a click flashes it
   * briefly, but the click is left to bubble and this stops being its own
   * button — nesting one inside another would be invalid markup.
   */
  passThroughClick?: boolean;
};

export default function LatestTownMapHover({
  townName,
  className = "",
  children,
  passThroughClick = false,
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
    flash,
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
        // Pass-through sits inside already-styled chrome (gold on navy), where
        // the default charcoal underline and navy hover would disappear.
        className={
          passThroughClick
            ? className
            : `cursor-help underline decoration-charcoal/25 decoration-dotted underline-offset-2 hover:text-navy ${className}`
        }
        onPointerDown={(event) => {
          // Nested inside sticky collapse buttons on Latest — keep the map
          // tap from also collapsing the group.
          if (!passThroughClick) event.stopPropagation();
          warm();
        }}
        onMouseEnter={fineHover ? show : undefined}
        onMouseLeave={fineHover ? scheduleClose : undefined}
        onFocus={fineHover ? show : undefined}
        onBlur={fineHover ? scheduleClose : undefined}
        onClick={(event) => {
          warm();
          if (passThroughClick) {
            flash();
            return;
          }
          event.preventDefault();
          event.stopPropagation();
          toggle();
        }}
        tabIndex={passThroughClick ? undefined : 0}
        role={passThroughClick ? undefined : "button"}
        aria-expanded={passThroughClick ? undefined : isOpen || exiting}
        aria-label={
          passThroughClick
            ? undefined
            : `${isOpen || exiting ? "Hide" : "Show"} map for ${town}`
        }
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
