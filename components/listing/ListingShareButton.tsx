"use client";

import { useEffect, useRef, useState } from "react";

/** iOS-style share glyph (box + upward arrow) — the common “Share” symbol. */
function ShareIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
      className={className}
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 3v11" />
      <path d="M8 7l4-4 4 4" />
      <path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7" />
    </svg>
  );
}

function CopiedIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
      className={className}
      stroke="currentColor"
      strokeWidth="2"
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
}: {
  /** Site-relative path or absolute URL. */
  href: string;
  title?: string | null;
  className?: string;
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
        <CopiedIcon className="h-[15px] w-[15px]" />
      ) : (
        <ShareIcon className="h-[15px] w-[15px]" />
      )}
    </button>
  );
}
