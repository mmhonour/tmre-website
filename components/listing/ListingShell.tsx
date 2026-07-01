"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

export function ListingShell({ children }: { children: React.ReactNode }) {
  return (
    <section className="navy-gradient text-white pt-32 pb-24 lg:pt-40 lg:pb-32 min-h-screen relative overflow-hidden">
      <div className="absolute inset-0 hero-grid opacity-30" aria-hidden />
      <div className="relative mx-auto max-w-7xl px-6 lg:px-10">
        <BackLink />
        {children}
      </div>
    </section>
  );
}

function BackLink() {
  const [href, setHref] = useState("/intelligence");
  const [label, setLabel] = useState("Deal board");
  useEffect(() => {
    const ref = document.referrer;
    if (ref.includes("/new-construction") || ref.includes("/properties")) {
      setHref("/new-construction");
      setLabel("New Construction");
    }
  }, []);
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-2 font-mono text-[11px] tracking-[0.15em] uppercase text-white/60 hover:text-gold transition-colors mb-10"
    >
      <span aria-hidden>←</span> Back to {label}
    </Link>
  );
}
