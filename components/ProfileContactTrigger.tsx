"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import ContactButton from "./ContactButton";
import PhoneCta from "./PhoneCta";

const iconCtaButtonClass =
  "inline-flex items-center justify-center rounded-full bg-gold min-w-[2.75rem] min-h-[2.75rem] p-3 text-navy transition-all hover:bg-gold-light hover:shadow-lg hover:shadow-gold/30 w-full";

type ProfileContactTriggerProps = {
  src: string;
  alt: string;
  sizes: string;
  priority?: boolean;
  frameClassName?: string;
  imageClassName?: string;
  phone?: { tel: string; display: string };
};

export default function ProfileContactTrigger({
  src,
  alt,
  sizes,
  priority = false,
  frameClassName = "",
  imageClassName = "object-cover grayscale transition-[filter] duration-500 group-hover:grayscale-0",
  phone,
}: ProfileContactTriggerProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [open]);

  return (
    <div ref={ref} className={`relative ${frameClassName}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="group relative aspect-square w-full overflow-hidden rounded-3xl shadow-2xl shadow-navy/10 ring-1 ring-charcoal/[0.06] cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-gold/60"
        aria-label="Contact Timothy Marks — call or email"
        aria-expanded={open}
      >
        <Image
          src={src}
          alt={alt}
          fill
          sizes={sizes}
          className={imageClassName}
          priority={priority}
        />
        <span
          className="absolute inset-0 bg-navy/0 group-hover:bg-navy/15 transition-colors"
          aria-hidden
        />
      </button>

      {open && (
        <div
          className="absolute left-0 right-0 top-full mt-3 z-30 rounded-2xl bg-white border border-charcoal/[0.08] shadow-xl shadow-navy/10 p-4"
          role="menu"
        >
          <p className="font-mono text-[10px] tracking-[0.2em] uppercase text-gold mb-3">
            Get in touch
          </p>
          <div className="flex flex-col items-stretch gap-2">
            <PhoneCta className={iconCtaButtonClass} phone={phone} />
            <ContactButton className={iconCtaButtonClass} />
          </div>
        </div>
      )}
    </div>
  );
}
