"use client";

import Link from "next/link";
import { type ReactNode, useEffect, useRef, useState } from "react";
import LatestAddressMetaPopover from "@/components/latest/LatestAddressMetaPopover";
import type { LatestListingRow } from "@/lib/latest-listings";

const HIDE_DELAY_MS = 600;

function isCoarsePointer(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(hover: none)").matches;
}

type LatestAddressMetaHoverProps = {
  listing: LatestListingRow;
  href: string;
  isLive: boolean;
  className?: string;
  children: ReactNode;
};

export default function LatestAddressMetaHover({
  listing,
  href,
  isLive,
  className = "",
  children,
}: LatestAddressMetaHoverProps) {
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
    clearHideTimer();
    setAnchorEl(anchorRef.current);
  };

  const hide = () => {
    clearHideTimer();
    setAnchorEl(null);
  };

  const scheduleHide = () => {
    clearHideTimer();
    hideTimerRef.current = setTimeout(hide, HIDE_DELAY_MS);
  };

  useEffect(() => () => clearHideTimer(), []);

  const linkClassName =
    className ||
    "min-w-0 truncate font-medium text-navy hover:text-gold transition-colors underline decoration-charcoal/15 underline-offset-2 hover:decoration-gold";

  const handleLinkClick = (event: React.MouseEvent<HTMLAnchorElement>) => {
    if (!isCoarsePointer()) return;
    if (!anchorEl) {
      event.preventDefault();
      show();
      return;
    }
    hide();
  };

  return (
    <>
      <span
        ref={anchorRef}
        className="inline-flex min-w-0 max-w-full"
        onMouseEnter={show}
        onMouseLeave={scheduleHide}
        onFocus={show}
        onBlur={scheduleHide}
      >
        {isLive ? (
          <Link
            href={href}
            className={linkClassName}
            onClick={handleLinkClick}
            aria-describedby={
              anchorEl ? `latest-meta-popover-${listing.key}` : undefined
            }
          >
            {children}
          </Link>
        ) : (
          <span className="min-w-0 truncate font-medium text-navy">{children}</span>
        )}
      </span>
      {anchorEl ? (
        <LatestAddressMetaPopover
          listing={listing}
          anchorEl={anchorEl}
          onRequestClose={hide}
          onMouseEnter={clearHideTimer}
          onMouseLeave={scheduleHide}
        />
      ) : null}
    </>
  );
}
