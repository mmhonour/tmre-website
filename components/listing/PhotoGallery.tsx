"use client";

export default function PhotoGallery({
  photos,
  active,
  setActive,
  address,
}: {
  photos: string[];
  active: number;
  setActive: (i: number) => void;
  address: string;
}) {
  if (photos.length === 0) {
    return (
      <div className="rounded-2xl border border-white/10 bg-white/[0.04] aspect-[16/10] flex items-center justify-center">
        <span className="font-mono text-[10px] tracking-[0.25em] uppercase text-white/45">
          No photos available
        </span>
      </div>
    );
  }
  const current = photos[Math.min(active, photos.length - 1)];
  return (
    <div className="space-y-3">
      <div className="relative rounded-2xl overflow-hidden bg-navy-dark border border-white/10 aspect-[16/10]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={current}
          alt={`${address} — photo ${active + 1} of ${photos.length}`}
          className="absolute inset-0 w-full h-full object-cover"
        />
        <span className="absolute bottom-3 right-3 font-mono text-[10px] tracking-[0.15em] uppercase text-white/80 bg-black/50 backdrop-blur-sm rounded-full px-3 py-1">
          {active + 1} / {photos.length}
        </span>
      </div>
      {photos.length > 1 && (
        <div className="grid grid-cols-6 sm:grid-cols-8 gap-2">
          {photos.map((p, i) => (
            <button
              key={`${p}-${i}`}
              type="button"
              onClick={() => setActive(i)}
              className={`relative aspect-square rounded-md overflow-hidden border transition-all ${
                i === active
                  ? "border-gold ring-2 ring-gold/40"
                  : "border-white/10 hover:border-white/30"
              }`}
              aria-label={`Photo ${i + 1}`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={p}
                alt=""
                className="absolute inset-0 w-full h-full object-cover"
                loading="lazy"
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
