export type ListingPhotoObfuscationSize = "primary" | "thumb" | "thumb-primary";

/** Blur + scale tuned so small thumbnails match large hero obscuring. */
export function listingPhotoObfuscationImgClass(
  obfuscated: boolean,
  base: string,
  size: ListingPhotoObfuscationSize = "primary",
): string {
  if (!obfuscated) return base;
  const effect =
    size === "thumb-primary"
      ? "blur-[24px] scale-[1.55]"
      : size === "thumb"
        ? "blur-[20px] scale-[1.45]"
        : "blur-[20px] scale-105";
  return `${base} ${effect}`;
}

export function listingPhotoObfuscationSizeForThumb(
  photoIndex: number,
): ListingPhotoObfuscationSize {
  return photoIndex === 0 ? "thumb-primary" : "thumb";
}

export function ListingPhotoObfuscationOverlay() {
  return (
    <div
      className="absolute inset-0 bg-navy/25 pointer-events-none"
      aria-hidden
    />
  );
}
