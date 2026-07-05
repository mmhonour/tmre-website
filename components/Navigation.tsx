"use client";

import ContactButton from "./ContactButton";
import VisitorLocationBadge from "./VisitorLocationBadge";
import { PhoneIcon, navIconClass } from "./icons";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

const iconCtaButtonClass =
  "inline-flex items-center justify-center rounded-full bg-gold min-w-[2.75rem] min-h-[2.75rem] p-3 text-navy transition-all hover:bg-gold-light hover:shadow-lg hover:shadow-gold/30";

const SHOW_BHHS_LOGO = false;

const BHHS_AGENT_PROFILE_URL = "https://timothymarks.bhhsneproperties.com";

const BHHS_LOGO_URL =
  "https://cdn-cws.datafloat.com/BNE/images/company/BNE/logo/logo.png";

function BhhsAgentProfileLink() {
  return (
    <a
      href={BHHS_AGENT_PROFILE_URL}
      target="_blank"
      rel="noopener noreferrer"
      className="group shrink-0"
      aria-label="Timothy Marks — Berkshire Hathaway HomeServices profile"
    >
      <span className="relative flex h-[108px] w-[108px] items-center justify-center rounded-md overflow-hidden bg-white ring-1 ring-white/25 shadow-md shadow-black/30 transition-transform group-hover:scale-105 group-hover:ring-gold/50">
        <Image
          src={BHHS_LOGO_URL}
          alt="Berkshire Hathaway HomeServices"
          width={96}
          height={96}
          className="object-contain"
        />
      </span>
    </a>
  );
}

type NavItem = { href: string; label: string; bold?: boolean; bolt?: boolean };

function LightningBolt({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
      width={14}
      height={14}
    >
      <path d="M13 2 3 14h8l-1 8 10-12h-8l1-8z" />
    </svg>
  );
}

const primaryLinks: NavItem[] = [
  { href: "/deal-of-the-day", label: "Deal of the Day", bold: true },
  { href: "/intelligence", label: "Intelligence", bolt: true },
  { href: "/spotlight", label: "Spotlight" },
];

const lookeyLink: NavItem = { href: "/lookey", label: "Looked at..." };

const exploreGroups = [
  {
    title: "Properties",
    links: [
      { href: "/new-construction", label: "New Construction" },
      { href: "/new-construction/expired-listings", label: "Expired Listings" },
      { href: "/fixer-uppers", label: "Fixer Uppers" },
      { href: "/find", label: "Find" },
    ],
  },
  {
    title: "Research",
    links: [
      { href: "/stats", label: "Stats" },
      { href: "/score", label: "Score" },
      { href: "/owner-history", label: "Owner History" },
    ],
  },
] as const;

const exploreHrefs = exploreGroups.flatMap((g) => g.links.map((l) => l.href));

const navItemClass =
  "inline-flex flex-col items-start text-left text-sm tracking-wide whitespace-nowrap leading-none shrink-0 transition-colors";

const navLabelClass =
  "inline-flex items-center gap-1.5 h-5 leading-none";

function navUnderline(active: boolean) {
  return active
    ? "mt-1 block h-px w-full bg-gold"
    : "mt-1 block h-px w-full opacity-0 pointer-events-none";
}

function NavLink({
  href,
  label,
  active,
  bold = false,
  bolt = false,
}: {
  href: string;
  label: string;
  active: boolean;
  bold?: boolean;
  bolt?: boolean;
}) {
  return (
    <Link
      href={href}
      className={`${navItemClass} ${
        bold ? "font-bold" : ""
      } ${active ? "text-gold" : "text-white/80 hover:text-white"}`}
    >
      <span className={navLabelClass}>
        {bolt ? (
          <LightningBolt className="w-3.5 h-3.5 shrink-0 text-gold drop-shadow-sm" />
        ) : null}
        {label}
      </span>
      <span className={navUnderline(active)} aria-hidden />
    </Link>
  );
}

function ExploreMenu({
  pathname,
  onNavigate,
  variant = "desktop",
}: {
  pathname: string;
  onNavigate?: () => void;
  variant?: "desktop" | "mobile";
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const exploreActive = exploreHrefs.some((href) => pathname === href);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  if (variant === "mobile") {
    return (
      <div className="mt-1 rounded-xl border border-white/10 bg-navy-dark px-2 py-3">
        <p className="px-2 font-mono text-[10px] tracking-[0.2em] uppercase text-gold mb-2">
          Explore
        </p>
        {exploreGroups.map((group) => (
          <div key={group.title} className="mb-3 last:mb-0">
            <p className="px-2 font-mono text-[9px] tracking-[0.15em] uppercase text-white/55 mb-1">
              {group.title}
            </p>
            {group.links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={onNavigate}
                className={`block px-2 py-2.5 text-sm rounded-md transition-colors ${
                  pathname === link.href
                    ? "text-gold bg-white/10"
                    : "text-white hover:text-white hover:bg-white/10"
                }`}
              >
                {link.label}
              </Link>
            ))}
          </div>
        ))}
      </div>
    );
  }

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="true"
        onClick={() => setOpen((v) => !v)}
        className={`${navItemClass} m-0 appearance-none border-0 bg-transparent p-0 cursor-pointer font-inherit text-sm tracking-wide leading-none ${
          exploreActive ? "text-gold" : "text-white/80 hover:text-white"
        }`}
      >
        <span className={navLabelClass}>
          Explore
          <svg
            className={`w-3.5 h-3.5 shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
            viewBox="0 0 12 12"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.5}
            aria-hidden
          >
            <path d="M2.5 4.5 6 8l3.5-3.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
        <span className={navUnderline(exploreActive)} aria-hidden />
      </button>

      {open && (
        <div
          className="absolute left-0 top-full mt-3 z-[60] min-w-[18rem] w-max rounded-xl border border-white/10 bg-navy shadow-2xl shadow-black/40 py-3"
          role="menu"
        >
          {exploreGroups.map((group, i) => (
            <div key={group.title} className={i > 0 ? "mt-3 pt-3 border-t border-white/10" : ""}>
              <p className="px-4 font-mono text-[9px] tracking-[0.2em] uppercase text-gold/70 mb-1.5">
                {group.title}
              </p>
              {group.links.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  role="menuitem"
                  onClick={() => setOpen(false)}
                  className={`block px-4 py-2 text-sm whitespace-nowrap transition-colors ${
                    pathname === link.href
                      ? "text-gold bg-white/5"
                      : "text-white/85 hover:text-white hover:bg-white/5"
                  }`}
                >
                  {link.label}
                </Link>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function DesktopNav({ pathname }: { pathname: string }) {
  return (
    <nav
      aria-label="Main"
      className="max-md:hidden shrink-0 flex items-end gap-5 lg:gap-6 xl:gap-8"
    >
      {primaryLinks.map((link) => (
        <NavLink
          key={link.href}
          href={link.href}
          label={link.label}
          active={pathname === link.href}
          bold={link.bold}
          bolt={link.bolt}
        />
      ))}
      <NavLink
        href={lookeyLink.href}
        label={lookeyLink.label}
        active={pathname === lookeyLink.href}
      />
      <ExploreMenu pathname={pathname} />
    </nav>
  );
}

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
        mobileOpen
          ? "bg-navy border-b border-white/10"
          : scrolled
            ? "bg-navy/85 backdrop-blur-md border-b border-white/10"
            : "bg-transparent"
      }`}
    >
      <div className="mx-auto max-w-7xl px-6 lg:px-10 py-3 lg:py-4">
        <div className="flex items-start justify-between gap-4 lg:gap-8">
          <div className="flex items-start gap-5 lg:gap-8 shrink-0 min-w-0">
            <div className="flex items-center gap-3 shrink-0">
              <Link
                href="/about"
                className="group shrink-0"
                aria-label="About Timothy Marks"
              >
                <span className="relative block w-10 h-10 rounded-lg overflow-hidden shadow-lg shadow-gold/20 ring-1 ring-gold/40 transition-transform group-hover:scale-105">
                  <Image
                    src="/timothy-tmre.png"
                    alt="Timothy Marks"
                    fill
                    sizes="40px"
                    className="object-cover grayscale transition-[filter] duration-500 group-hover:grayscale-0"
                  />
                </span>
              </Link>
              <Link href="/" className="flex flex-col gap-0 group shrink-0" aria-label="TMRE home">
                <span className="font-serif text-white text-xl tracking-[0.15em] leading-tight group-hover:text-gold transition-colors">
                  TMRE
                </span>
                <span className="font-serif text-white/75 text-[11px] tracking-wide leading-tight">
                  Timothy Marks
                  <br />
                  Real Estate
                </span>
              </Link>
            </div>

            <DesktopNav pathname={pathname} />
          </div>

          <div className="hidden md:flex items-center gap-2 shrink-0">
            <VisitorLocationBadge />
            <ContactButton className={iconCtaButtonClass} />
            <a href="tel:6175040741" className={iconCtaButtonClass} aria-label="Call me">
              <PhoneIcon className={navIconClass} />
            </a>
            {SHOW_BHHS_LOGO ? <BhhsAgentProfileLink /> : null}
          </div>

          <div className="md:hidden flex items-center gap-2 shrink-0">
            <VisitorLocationBadge />
            <button
              type="button"
              onClick={() => setMobileOpen((v) => !v)}
              aria-label="Toggle navigation"
              aria-expanded={mobileOpen}
              className="flex flex-col gap-1.5 p-2"
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
        </div>

        {mobileOpen && (
          <nav className="md:hidden pb-6 flex flex-col gap-1 border-t border-white/10 pt-4 bg-navy">
            {primaryLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={`inline-flex items-center gap-1.5 px-2 py-3 text-sm rounded-md transition-colors ${
                  link.bold ? "font-bold" : ""
                } ${
                  pathname === link.href
                    ? "text-gold bg-white/5"
                    : "text-white/85 hover:text-white hover:bg-white/5"
                }`}
              >
                {link.bolt ? (
                  <LightningBolt className="w-3.5 h-3.5 shrink-0 text-gold drop-shadow-sm" />
                ) : null}
                {link.label}
              </Link>
            ))}
            <Link
              href={lookeyLink.href}
              className={`inline-flex items-center gap-1.5 px-2 py-3 text-sm rounded-md transition-colors ${
                pathname === lookeyLink.href
                  ? "text-gold bg-white/5"
                  : "text-white/85 hover:text-white hover:bg-white/5"
              }`}
            >
              {lookeyLink.label}
            </Link>
            <ExploreMenu
              pathname={pathname}
              variant="mobile"
              onNavigate={() => setMobileOpen(false)}
            />
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <ContactButton className={iconCtaButtonClass} />
              <a href="tel:6175040741" className={iconCtaButtonClass} aria-label="Call me">
                <PhoneIcon className={navIconClass} />
              </a>
              {SHOW_BHHS_LOGO ? <BhhsAgentProfileLink /> : null}
            </div>
          </nav>
        )}
      </div>
    </header>
  );
}
