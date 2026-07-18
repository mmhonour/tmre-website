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
  obfuscate?: boolean;
};

export default function ListingHeroPhoto({
  url,
  alt,
  href = null,
  photoCount,
  photoIndex = 0,
  unframed = false,
  bare = false,
  obfuscate = false,
}: ListingHeroPhotoProps) {
  const panelClass = unframed ? listingPanelClass : listingFrameClass;

  const media = href ? (
    <Link
      href={href}
      className="block relative rounded-xl overflow-hidden border border-white/10 bg-navy-dark aspect-[4/3] group"
      aria-label="View all photos"
    >
      <ListingThumbImage
        src={url}
        alt={alt}
        priority
        className="absolute inset-0 block w-full h-full"
        imgClassName={listingPhotoObfuscationImgClass(
          obfuscate,
          "absolute inset-0 w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.02]",
        )}
      />
      {obfuscate ? <ListingPhotoObfuscationOverlay /> : null}
    </Link>
  ) : (
    <div className="relative rounded-xl overflow-hidden border border-white/10 bg-navy-dark aspect-[4/3]">
      <ListingThumbImage
        src={url}
        alt={alt}
        priority
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
      <p className="mt-1.5 text-right font-mono text-[10px] tracking-[0.15em] uppercase text-white/55">
        {photoIndex + 1} / {photoCount}
      </p>
    ) : null;

  const image = (
    <div>
      {media}
      {caption}
    </div>
  );

  if (bare) return image;

  return <div className={panelClass}>{image}</div>;
}
