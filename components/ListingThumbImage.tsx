"use client";

import { useState } from "react";

type ListingThumbImageProps = {
  src: string;
  alt?: string;
  className?: string;
  imgClassName?: string;
  /** When true, browser loads this before lazy images on the page. */
  priority?: boolean;
  /** Hide the loading pulse placeholder (e.g. parent hides the card until load). */
  hideLoadingPlaceholder?: boolean;
  onLoaded?: () => void;
  onFailed?: () => void;
};

export default function ListingThumbImage({
  src,
  alt = "",
  className = "relative block w-full h-full overflow-hidden",
  imgClassName = "absolute inset-0 w-full h-full object-cover transition-opacity duration-300",
  priority = true,
  hideLoadingPlaceholder = false,
  onLoaded,
  onFailed,
}: ListingThumbImageProps) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);

  return (
    <span className={className}>
      {!loaded && !failed && !hideLoadingPlaceholder ? (
        <span
          className="absolute inset-0 bg-white/10 animate-pulse"
          aria-hidden
        />
      ) : null}
      {!failed ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={alt}
          className={`${imgClassName} ${loaded ? "opacity-100" : "opacity-0"}`}
          loading={priority ? "eager" : "lazy"}
          fetchPriority={priority ? "high" : "auto"}
          decoding="async"
          onLoad={() => {
            setLoaded(true);
            onLoaded?.();
          }}
          onError={() => {
            setFailed(true);
            onFailed?.();
          }}
        />
      ) : (
        <span
          className="absolute inset-0 bg-cream flex items-center justify-center"
          aria-hidden
        >
          <svg className="w-6 h-6 text-navy/20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1}
              d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"
            />
          </svg>
        </span>
      )}
    </span>
  );
}
