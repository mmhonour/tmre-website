"use client";

import { useEffect, useRef, useState } from "react";

/** Survive React remounts during Latest ticker reorders — avoids pulse / reload flash. */
const loadedSrcCache = new Set<string>();
const failedSrcCache = new Set<string>();

function photoFetchRetryUrl(src: string): string {
  return src.includes("?") ? `${src}&fetch=1` : `${src}?fetch=1`;
}

type ListingThumbImageProps = {
  src: string;
  alt?: string;
  className?: string;
  imgClassName?: string;
  /** When true, browser loads this before lazy images on the page. */
  priority?: boolean;
  /** Hide the loading pulse placeholder (e.g. parent hides the card until load). */
  hideLoadingPlaceholder?: boolean;
  /** Override pulse placeholder (e.g. light feed backgrounds). */
  placeholderClassName?: string;
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
  placeholderClassName = "absolute inset-0 bg-white/10 animate-pulse",
  onLoaded,
  onFailed,
}: ListingThumbImageProps) {
  const [activeSrc, setActiveSrc] = useState(src);
  const retriedFetchRef = useRef(false);
  const [loaded, setLoaded] = useState(() => loadedSrcCache.has(src));
  const [failed, setFailed] = useState(() => failedSrcCache.has(src));

  useEffect(() => {
    retriedFetchRef.current = false;
    setActiveSrc(src);
    setLoaded(loadedSrcCache.has(src));
    setFailed(failedSrcCache.has(src));
  }, [src]);

  return (
    <span className={className}>
      {!loaded && !failed && !hideLoadingPlaceholder ? (
        <span className={placeholderClassName} aria-hidden />
      ) : null}
      {!failed ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={activeSrc}
          src={activeSrc}
          alt={alt}
          className={`${imgClassName} ${loaded ? "opacity-100" : "opacity-0"}`}
          loading={priority ? "eager" : "lazy"}
          fetchPriority={priority ? "high" : "auto"}
          decoding="async"
          onLoad={() => {
            loadedSrcCache.add(activeSrc);
            failedSrcCache.delete(activeSrc);
            setLoaded(true);
            setFailed(false);
            onLoaded?.();
          }}
          onError={() => {
            if (!retriedFetchRef.current && !activeSrc.includes("fetch=1")) {
              retriedFetchRef.current = true;
              const retrySrc = photoFetchRetryUrl(activeSrc);
              failedSrcCache.delete(activeSrc);
              loadedSrcCache.delete(activeSrc);
              setLoaded(false);
              setActiveSrc(retrySrc);
              return;
            }
            failedSrcCache.add(activeSrc);
            loadedSrcCache.delete(activeSrc);
            setFailed(true);
            setLoaded(false);
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
