import Link from "next/link";
import { listingFrameClass, listingPanelClass } from "@/components/listing/listing-frame";
import {
  ListingPhotoObfuscationOverlay,
  listingPhotoObfuscationImgClass,
} from "@/components/listing/ListingPhotoObfuscation";
import ListingThumbImage from "@/components/ListingThumbImage";

export type ListingHeroPhotoProps = {
  url: string;
  alt: string;
  href?: string | null;
  photoCount: number;
  /** 0-based index for the "N / total" caption under the photo. */
  photoIndex?: number;
  unframed?: boolean;
  bare?: boolean;
  /**
   * Flush stack: no radius, no border, caption overlaid — photos butt together
   * edge-to-edge with no gaps.
   */
  seamless?: boolean;
  obfuscate?: boolean;
  /** Eager-load for LCP; leave false for stacked photos below the fold. */
  priority?: boolean;
};

export default function ListingHeroPhoto({
  url,
  alt,
  href = null,
  photoCount,
  photoIndex = 0,
  unframed = false,
  bare = false,
  seamless = false,
  obfuscate = false,
  priority = true,
}: ListingHeroPhotoProps) {
  const panelClass = unframed ? listingPanelClass : listingFrameClass;

  const shellClass = seamless
    ? "block relative overflow-hidden bg-navy-dark aspect-[4/3] max-lg:aspect-[16/10] rounded-none border-0 group"
    : "block relative overflow-hidden border border-white/10 bg-navy-dark aspect-[4/3] max-lg:aspect-[16/10] rounded-xl max-lg:rounded-none max-lg:border-x-0 group";

  const media = href ? (
    <Link href={href} className={shellClass} aria-label="View all photos">
      <ListingThumbImage
        src={url}
        alt={alt}
        priority={priority}
        className="absolute inset-0 block w-full h-full"
        imgClassName={listingPhotoObfuscationImgClass(
          obfuscate,
          "absolute inset-0 w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.02]",
        )}
      />
      {obfuscate ? <ListingPhotoObfuscationOverlay /> : null}
    </Link>
  ) : (
    <div className={shellClass}>
      <ListingThumbImage
        src={url}
        alt={alt}
        priority={priority}
        className="absolute inset-0 block w-full h-full"
        imgClassName={listingPhotoObfuscationImgClass(
          obfuscate,
          "absolute inset-0 w-full h-full object-cover",
        )}
      />
      {obfuscate ? <ListingPhotoObfuscationOverlay /> : null}
    </div>
  );

  const caption =
    photoCount > 1 ? (
      seamless ? (
        <p className="pointer-events-none absolute bottom-2 right-2 z-[1] rounded bg-navy/70 px-1.5 py-0.5 font-mono text-[10px] tracking-[0.15em] uppercase text-white/80">
          {photoIndex + 1} / {photoCount}
        </p>
      ) : (
        <p className="mt-1.5 px-4 lg:px-0 text-right font-mono text-[10px] tracking-[0.15em] uppercase text-white/55">
          {photoIndex + 1} / {photoCount}
        </p>
      )
    ) : null;

  const image = (
    <div className={seamless ? "relative" : undefined}>
      {media}
      {caption}
    </div>
  );

  if (bare || seamless) return image;

  return <div className={panelClass}>{image}</div>;
}
