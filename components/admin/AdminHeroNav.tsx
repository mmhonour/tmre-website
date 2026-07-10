import Link from "next/link";
import { ADMIN_SECTION_LINKS, adminSectionHref } from "@/lib/admin-nav";

export default function AdminHeroNav() {
  return (
    <nav
      aria-label="Admin quick links"
      className="mt-6 animate-fade-up-delay-2 flex flex-wrap gap-2"
    >
      {ADMIN_SECTION_LINKS.map((link) => (
        <Link
          key={link.id}
          href={adminSectionHref(link.id, link.tab)}
          className="font-mono text-[10px] tracking-[0.1em] uppercase rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-white/80 hover:border-gold/40 hover:text-gold transition-colors"
        >
          {link.label}
        </Link>
      ))}
    </nav>
  );
}
