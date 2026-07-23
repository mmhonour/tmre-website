"use client";

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  DEFAULT_RETURN_NAV,
  LISTING_RETURN_STORAGE_KEY,
  type ReturnNav,
  parseReturnFromSearchParams,
  persistReturnNav,
  resolveReturnNav,
} from "@/lib/listing-return-nav";

function ListingBackLinkInner({ className = "mb-10" }: { className?: string }) {
  const searchParams = useSearchParams();
  const [nav, setNav] = useState<ReturnNav>(DEFAULT_RETURN_NAV);

  useEffect(() => {
    const fromParam = searchParams.get("from");
    const storedJson = sessionStorage.getItem(LISTING_RETURN_STORAGE_KEY);
    const resolved = resolveReturnNav({
      fromParam,
      storedJson,
      referrer: document.referrer || null,
      origin: window.location.origin,
    });
    setNav(resolved);

    if (fromParam) {
      const fromNav = parseReturnFromSearchParams(searchParams);
      if (fromNav) persistReturnNav(fromNav);
    }
  }, [searchParams]);

  return (
    <Link
      href={nav.href}
      className={`inline-flex items-center gap-2 font-mono text-[11px] tracking-[0.15em] uppercase text-white/60 hover:text-gold transition-colors ${className}`}
    >
      <span aria-hidden>←</span> Back to {nav.label}
    </Link>
  );
}

export function ListingBackLink({ className = "mb-10" }: { className?: string }) {
  return (
    <Suspense fallback={null}>
      <ListingBackLinkInner className={className} />
    </Suspense>
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
      <div className="relative mx-auto max-w-7xl px-0 lg:px-10">
        {children}
      </div>
    </section>
  );
}
