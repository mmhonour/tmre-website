"use client";

import ContactButton from "./ContactButton";
import { useSiteUnlockActions, useSiteUnlocked } from "./SiteUnlockProvider";
import VisitorLocationBadge from "./VisitorLocationBadge";
import PhoneCta from "./PhoneCta";
import { AGENT_MLS_ID } from "@/lib/business-info";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

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
      aria-label={`Timothy Marks (MLS #${AGENT_MLS_ID}) — Berkshire Hathaway HomeServices profile`}
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

function MagnifyingGlassIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      width={14}
      height={14}
    >
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}

const primaryLinks: NavItem[] = [
  { href: "/deal-of-the-day", label: "Deal of the Day", bold: true },
  { href: "/intelligence", label: "Intelligence", bolt: true },
  { href: "/spotlight", label: "Spotlight" },
];

const lookeyLink: NavItem = { href: "/lookey", label: "Looked at..." };
const listWithMeLink: NavItem = { href: "/list-with-me", label: "List With Me" };

type ExploreLink = {
  href: string;
  label: string;
  requiresUnlock?: boolean;
};

type ExploreGroup = {
  title: string;
  links: ExploreLink[];
};

const exploreGroupsBase: ExploreGroup[] = [
  {
    title: "Properties",
    links: [
      { href: "/latest", label: "Latest" },
      { href: "/open-houses", label: "Open Houses" },
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
      { href: "/town-budget", label: "Town Budget" },
      { href: "/score", label: "Score" },
      { href: "/owner-history", label: "Owner History" },
    ],
  },
  {
    title: "System",
    links: [
      { href: "/admin", label: "Admin" },
      { href: "/visitors", label: "Visitors", requiresUnlock: true },
    ],
  },
];

function getExploreGroups(siteUnlocked: boolean): ExploreGroup[] {
  return exploreGroupsBase
    .map((group) => ({
      title: group.title,
      links: group.links.filter((link) => !link.requiresUnlock || siteUnlocked),
    }))
    .filter((group) => group.links.length > 0);
}

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
  magnifier = false,
}: {
  href: string;
  label: string;
  active: boolean;
  bold?: boolean;
  bolt?: boolean;
  magnifier?: boolean;
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
        {magnifier ? (
          <MagnifyingGlassIcon className="w-3.5 h-3.5 shrink-0 text-gold drop-shadow-sm" />
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
  siteUnlocked = false,
}: {
  pathname: string;
  onNavigate?: () => void;
  variant?: "desktop" | "mobile";
  siteUnlocked?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const exploreGroups = getExploreGroups(siteUnlocked);
  const exploreActive = exploreGroups.some((group) =>
    group.links.some((link) => pathname === link.href),
  );

  useEffect(() => {
    if (!open || variant === "mobile") return;
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
  }, [open, variant]);

  if (variant === "mobile") {
    return (
      <div>
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className={`w-full inline-flex items-center justify-between gap-1.5 px-2 py-3 text-sm rounded-md transition-colors ${
            exploreActive || open
              ? "text-gold bg-white/5"
              : "text-white/85 hover:text-white hover:bg-white/5"
          }`}
        >
          <span>Explore</span>
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
        </button>
        {open && (
          <div className="mt-1 rounded-xl border border-white/10 bg-navy-dark px-2 py-3">
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
        )}
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

function DesktopNav({
  pathname,
  siteUnlocked,
}: {
  pathname: string;
  siteUnlocked: boolean;
}) {
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
        magnifier
      />
      <NavLink
        href={listWithMeLink.href}
        label={listWithMeLink.label}
        active={pathname === listWithMeLink.href}
      />
      <ExploreMenu pathname={pathname} siteUnlocked={siteUnlocked} />
    </nav>
  );
}

function SiteLoginButton() {
  return (
    <Link
      href="/admin"
      className="font-mono text-[9px] tracking-[0.14em] uppercase text-white/55 hover:text-gold transition-colors"
    >
      Log in
    </Link>
  );
}

function SiteLogoutButton() {
  const router = useRouter();
  const { setUnlocked } = useSiteUnlockActions();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const onLogout = () => {
    setError(null);
    startTransition(async () => {
      try {
        const res = await fetch("/api/site-password", { method: "DELETE" });
        if (!res.ok) throw new Error("Logout failed");
        setUnlocked(false);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Logout failed");
      }
    });
  };

  return (
    <div className="flex flex-col items-center gap-0.5">
      <button
        type="button"
        onClick={onLogout}
        disabled={pending}
        className="font-mono text-[9px] tracking-[0.14em] uppercase text-white/55 hover:text-gold transition-colors disabled:opacity-50"
        aria-label="Log out of Admin"
      >
        {pending ? "…" : "Log out"}
      </button>
      {error ? (
        <span className="font-mono text-[8px] text-coral/90" role="alert">
          Failed
        </span>
      ) : null}
    </div>
  );
}

function PhoneCallWithLogout({
  align = "center",
  phone,
}: {
  align?: "center" | "start";
  phone?: { tel: string; display: string };
}) {
  const siteUnlocked = useSiteUnlocked();

  return (
    <div
      className={`flex flex-col gap-1 ${
        align === "start" ? "items-start" : "items-center"
      }`}
    >
      <PhoneCta className={iconCtaButtonClass} align={align} phone={phone} />
      {siteUnlocked ? <SiteLogoutButton /> : <SiteLoginButton />}
    </div>
  );
}

export default function Navigation({
  siteUnlocked = false,
  phone,
}: {
  siteUnlocked?: boolean;
  phone?: { tel: string; display: string };
}) {
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

            <DesktopNav pathname={pathname} siteUnlocked={siteUnlocked} />
          </div>

          <div className="hidden md:flex items-start gap-2 shrink-0">
            <VisitorLocationBadge />
            <ContactButton className={iconCtaButtonClass} />
            <PhoneCallWithLogout phone={phone} />
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
          <nav className="md:hidden flex flex-col gap-1 border-t border-white/10 pt-4 pb-6 bg-navy max-h-[calc(100dvh-4.5rem)] overflow-y-auto overscroll-contain">
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
              <MagnifyingGlassIcon className="w-3.5 h-3.5 shrink-0 text-gold drop-shadow-sm" />
              {lookeyLink.label}
            </Link>
            <Link
              href={listWithMeLink.href}
              className={`inline-flex items-center gap-1.5 px-2 py-3 text-sm rounded-md transition-colors ${
                pathname === listWithMeLink.href
                  ? "text-gold bg-white/5"
                  : "text-white/85 hover:text-white hover:bg-white/5"
              }`}
            >
              {listWithMeLink.label}
            </Link>
            <ExploreMenu
              pathname={pathname}
              variant="mobile"
              siteUnlocked={siteUnlocked}
              onNavigate={() => setMobileOpen(false)}
            />
            <div className="mt-3 flex flex-wrap items-start gap-2">
              <ContactButton className={iconCtaButtonClass} />
              <PhoneCallWithLogout align="start" phone={phone} />
              {SHOW_BHHS_LOGO ? <BhhsAgentProfileLink /> : null}
            </div>
          </nav>
        )}
      </div>
    </header>
  );
}
