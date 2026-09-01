"use client";

import { useRef, useState } from "react";

/** Layers kept mounted either side of the active photo so crossfades never show a gap. */
const WINDOW_RADIUS = 1;

function photoFetchRetryUrl(src: string): string {
  return src.includes("?") ? `${src}&fetch=1` : `${src}?fetch=1`;
}

function ShowcaseLayer({
  src,
  alt,
  active,
  drift,
  driftDelayMs,
  onFailed,
}: {
  src: string;
  alt: string;
  active: boolean;
  drift: boolean;
  driftDelayMs: number;
  onFailed: () => void;
}) {
  // Keyed on `src` by the stage, so a new photo always remounts this layer.
  const [activeSrc, setActiveSrc] = useState(src);
  const [loaded, setLoaded] = useState(false);
  const retriedRef = useRef(false);

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={activeSrc}
      alt={active ? alt : ""}
      aria-hidden={!active}
      className={`listing-showcase-layer ${drift ? "listing-showcase-layer--drift" : ""} ${
        active && loaded ? "opacity-100" : "opacity-0"
      }`}
      style={{ animationDelay: `-${driftDelayMs}ms` }}
      decoding="async"
      loading="eager"
      fetchPriority={active ? "high" : "low"}
      onLoad={() => setLoaded(true)}
      onError={() => {
        if (!retriedRef.current && !activeSrc.includes("fetch=1")) {
          retriedRef.current = true;
          setActiveSrc(photoFetchRetryUrl(activeSrc));
          return;
        }
        onFailed();
      }}
    />
  );
}

export default function ShowcasePhotoStage({
  photos,
  index,
  altBase,
  drift = true,
  onPhotoFailed,
}: {
  photos: readonly string[];
  index: number;
  altBase: string;
  /** Slow Ken Burns pan; callers disable it for reduced-motion. */
  drift?: boolean;
  /** MLS photo counts overshoot reality — failed slots get dropped from rotation. */
  onPhotoFailed?: (photoIndex: number) => void;
}) {
  const total = photos.length;
  if (total === 0) return null;

  const visible = new Set<number>();
  for (let offset = -WINDOW_RADIUS; offset <= WINDOW_RADIUS; offset += 1) {
    visible.add((index + offset + total * 2) % total);
  }

  return (
    <div className="absolute inset-0 overflow-hidden bg-navy-dark">
      {[...visible].map((photoIndex) => (
        <ShowcaseLayer
          key={photos[photoIndex]}
          src={photos[photoIndex]}
          alt={`${altBase} — photo ${photoIndex + 1} of ${total}`}
          active={photoIndex === index}
          drift={drift}
          driftDelayMs={(photoIndex % 4) * 3000}
          onFailed={() => onPhotoFailed?.(photoIndex)}
        />
      ))}
    </div>
  );
}
