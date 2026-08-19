"use client";

import { useMemo, type ReactNode } from "react";
import ZipBoundaryPopover, {
  prefetchZipBoundaries,
} from "@/components/ZipBoundaryPopover";
import { useMapPopoverAnchor } from "@/hooks/useMapPopoverAnchor";
import { isTmreTown, resolveListingTown, zipsForTown } from "@/lib/tmre-towns";

type LatestZipMapHoverProps = {
  zip: string;
  townName: string | null;
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

export default function LatestZipMapHover({
  zip,
  townName,
  className = "",
  children,
  passThroughClick = false,
}: LatestZipMapHoverProps) {
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
        // Pass-through sits inside already-styled chrome (gold on navy), where
        // the default charcoal underline and navy hover would disappear.
        className={
          passThroughClick
            ? className
            : `cursor-help underline decoration-charcoal/25 decoration-dotted underline-offset-2 hover:text-navy ${className}`
        }
        onPointerDown={(event) => {
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
            : `${isOpen || exiting ? "Hide" : "Show"} map for zip ${zip}`
        }
      >
        {children ?? zip}
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
