"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Share-nodes glyph: three dots at the corners of a left-pointing triangle,
 * with the right edge open (no line between the two right nodes).
 */
function ShareIcon({
  className = "",
  strokeWidth = 1.75,
}: {
  className?: string;
  strokeWidth?: number;
}) {
  // Scale node size with stroke so thick mobile placements don't look chunky.
  const nodeR = Math.max(1.35, Math.min(2.1, strokeWidth * 0.95 + 0.55));
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
      className={className}
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="6" cy="12" r={nodeR} fill="currentColor" stroke="none" />
      <circle cx="18" cy="6" r={nodeR} fill="currentColor" stroke="none" />
      <circle cx="18" cy="18" r={nodeR} fill="currentColor" stroke="none" />
      <path d="M8.1 11.1 15.9 7.1" />
      <path d="M8.1 12.9 15.9 16.9" />
    </svg>
  );
}

function CopiedIcon({
  className = "",
  strokeWidth = 2,
}: {
  className?: string;
  strokeWidth?: number;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
      className={className}
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M5 13l4 4L19 7" />
    </svg>
  );
}

/**
 * Share / Copy control that always uses the short canonical URL
 * (`/listings/{mlsId}` or `/spotlight`), even when the address bar still
 * shows address/city query params.
 */
export default function ListingShareButton({
  href,
  title,
  className = "",
  iconClassName = "h-[15px] w-[15px]",
  strokeWidth,
}: {
  /** Site-relative path or absolute URL. */
  href: string;
  title?: string | null;
  className?: string;
  /** Override glyph size (defaults to the compact listing-header size). */
  iconClassName?: string;
  /** Heavier stroke for larger / emphasis placements. */
  strokeWidth?: number;
}) {
  const [status, setStatus] = useState<"idle" | "copied">("idle");
  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (resetTimerRef.current != null) clearTimeout(resetTimerRef.current);
    };
  }, []);

  const absoluteUrl = () => {
    if (/^https?:\/\//i.test(href)) return href;
    const path = href.startsWith("/") ? href : `/${href}`;
    return `${window.location.origin}${path}`;
  };

  const markCopied = () => {
    setStatus("copied");
    if (resetTimerRef.current != null) clearTimeout(resetTimerRef.current);
    resetTimerRef.current = setTimeout(() => {
      resetTimerRef.current = null;
      setStatus("idle");
    }, 2000);
  };

  const handleShare = async () => {
    const url = absoluteUrl();
    const shareTitle = title?.trim() || "TMRE listing";

    if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
      try {
        await navigator.share({ title: shareTitle, url, text: shareTitle });
        return;
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        // Fall through to clipboard when share is unavailable / fails.
      }
    }

    try {
      await navigator.clipboard.writeText(url);
      markCopied();
    } catch {
      // Last resort for older browsers / denied clipboard.
      window.prompt("Copy this link:", url);
    }
  };

  return (
    <button
      type="button"
      onClick={() => void handleShare()}
      className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-gold/85 transition-colors hover:bg-white/10 hover:text-gold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold/50 ${className}`}
      aria-label={
        status === "copied" ? "Link copied" : "Share or copy short listing link"
      }
      title={status === "copied" ? "Link copied" : "Share short link"}
    >
      {status === "copied" ? (
        <CopiedIcon
          className={iconClassName}
          strokeWidth={strokeWidth ?? 2}
        />
      ) : (
        <ShareIcon
          className={iconClassName}
          strokeWidth={strokeWidth ?? 1.75}
        />
      )}
    </button>
  );
}
