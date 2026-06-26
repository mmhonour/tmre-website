"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

const links = [
  { href: "/intelligence", label: "Intelligence" },
  { href: "/properties", label: "New Construction" },
  { href: "/about", label: "About" },
];

export default function Navigation() {
  const pathname = usePathname();
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        scrolled
          ? "bg-navy/85 backdrop-blur-md border-b border-white/10"
          : "bg-transparent"
      }`}
    >
      <div className="mx-auto max-w-7xl px-6 lg:px-10">
        <div className="flex items-center justify-between h-18 py-4">
          <Link
            href="/"
            className="flex items-center gap-3 group"
            aria-label="TMRE home"
          >
            <div className="flex flex-col items-center gap-0.5">
              <span className="relative w-10 h-10 rounded-lg overflow-hidden shadow-lg shadow-gold/20 ring-1 ring-gold/40 transition-transform group-hover:scale-105">
                <Image
                  src="/timothy-tmre.png"
                  alt="Timothy Marks"
                  fill
                  sizes="40px"
                  className="object-cover"
                />
              </span>
              <span className="font-serif italic text-white/80 text-[9px] tracking-wide leading-none whitespace-nowrap">
                Timothy Marks Real Estate
              </span>
            </div>
            <span className="font-serif text-white text-xl tracking-[0.15em]">
              TMRE
            </span>
          </Link>

          <nav className="hidden md:flex items-center gap-8">
            {links.map((link) => {
              const active = pathname === link.href;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`text-sm tracking-wide transition-colors ${
                    active
                      ? "text-gold"
                      : "text-white/80 hover:text-white"
                  }`}
                >
                  {link.label}
                  {active && (
                    <span className="block h-px bg-gold mt-1" aria-hidden />
                  )}
                </Link>
              );
            })}
            <div className="flex flex-col items-end gap-1">
              <Link
                href="/intelligence"
                className="inline-flex items-center gap-2 rounded-full bg-gold px-5 py-2.5 text-sm font-medium text-navy transition-all hover:bg-gold-light hover:shadow-lg hover:shadow-gold/30 hover:-translate-y-0.5"
              >
                Get Started
                <span aria-hidden>→</span>
              </Link>
              <div className="flex items-center gap-3 font-mono text-[10px] tracking-wide text-white/50">
                <a href="tel:6175040741" className="hover:text-gold transition-colors">617-504-0741</a>
                <span aria-hidden>·</span>
                <a href="mailto:tmarks@bhhsne.com" className="hover:text-gold transition-colors">tmarks@bhhsne.com</a>
              </div>
            </div>
          </nav>

          <button
            type="button"
            onClick={() => setMobileOpen((v) => !v)}
            aria-label="Toggle navigation"
            aria-expanded={mobileOpen}
            className="md:hidden flex flex-col gap-1.5 p-2"
          >
            <span
              className={`block w-6 h-px bg-white transition-transform ${
                mobileOpen ? "translate-y-2 rotate-45" : ""
              }`}
            />
            <span
              className={`block w-6 h-px bg-white transition-opacity ${
                mobileOpen ? "opacity-0" : ""
              }`}
            />
            <span
              className={`block w-6 h-px bg-white transition-transform ${
                mobileOpen ? "-translate-y-2 -rotate-45" : ""
              }`}
            />
          </button>
        </div>

        {mobileOpen && (
          <nav className="md:hidden pb-6 flex flex-col gap-1 border-t border-white/10 pt-4">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={`px-2 py-3 text-sm rounded-md transition-colors ${
                  pathname === link.href
                    ? "text-gold bg-white/5"
                    : "text-white/85 hover:text-white hover:bg-white/5"
                }`}
              >
                {link.label}
              </Link>
            ))}
            <Link
              href="/intelligence"
              className="mt-3 inline-flex items-center justify-center gap-2 rounded-full bg-gold px-5 py-3 text-sm font-medium text-navy"
            >
              Get Started →
            </Link>
            <div className="mt-3 flex items-center justify-center gap-4 font-mono text-[11px] tracking-wide text-white/55 border-t border-white/10 pt-4">
              <a href="tel:6175040741" className="hover:text-gold transition-colors">617-504-0741</a>
              <span aria-hidden>·</span>
              <a href="mailto:tmarks@bhhsne.com" className="hover:text-gold transition-colors">tmarks@bhhsne.com</a>
            </div>
          </nav>
        )}
      </div>
    </header>
  );
}
