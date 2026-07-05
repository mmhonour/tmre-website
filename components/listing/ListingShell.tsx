"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

export function ListingBackLink({ className = "mb-10" }: { className?: string }) {
  const [href, setHref] = useState("/intelligence");
  const [label, setLabel] = useState("Deal board");
  useEffect(() => {
    const ref = document.referrer;
    if (ref.includes("/new-construction/expired-listings")) {
      setHref("/new-construction/expired-listings");
      setLabel("Expired Listings");
    } else if (ref.includes("/new-construction") || ref.includes("/properties")) {
      setHref("/new-construction");
      setLabel("New Construction");
    }
  }, []);
  return (
    <Link
      href={href}
      className={`inline-flex items-center gap-2 font-mono text-[11px] tracking-[0.15em] uppercase text-white/60 hover:text-gold transition-colors ${className}`}
    >
      <span aria-hidden>←</span> Back to {label}
    </Link>
  );
}

export function ListingShell({
  children,
}: {
  children: React.ReactNode;
  variant?: "listing" | "spotlight";
}) {
  return (
    <section className="navy-gradient text-white pt-20 pb-20 lg:pt-24 lg:pb-28 min-h-screen relative">
      <div className="absolute inset-0 hero-grid opacity-30" aria-hidden />
      <div className="relative mx-auto max-w-7xl px-6 lg:px-10">
        {children}
      </div>
    </section>
  );
}
