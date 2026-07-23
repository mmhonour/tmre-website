"use client";

import { useEffect, useRef, useState } from "react";

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
      className={`font-mono text-[10px] tracking-[0.14em] uppercase text-gold/80 underline decoration-gold/35 underline-offset-2 transition-colors hover:text-gold whitespace-nowrap ${className}`}
      aria-label={
        status === "copied" ? "Link copied" : "Share or copy short listing link"
      }
      title="Share short link"
    >
      {status === "copied" ? "Copied" : "Share"}
    </button>
  );
}
