import Link from "next/link";
import { ADMIN_PRODUCT_PAGES, ADMIN_REPO_DOCS } from "@/lib/admin-nav";

function ProductPageGrid() {
  return (
    <ul className="divide-y divide-charcoal/[0.08]">
      {ADMIN_PRODUCT_PAGES.map((link) => (
        <li key={link.href}>
          <Link
            href={link.href}
            className="flex flex-col gap-1 px-5 py-4 transition-colors hover:bg-cream/30 sm:px-6"
          >
            <span className="font-mono text-[11px] tracking-[0.12em] uppercase text-navy">
              {link.label}
            </span>
            <span className="text-sm text-charcoal/65">{link.description}</span>
            <span className="font-mono text-[10px] text-charcoal/40">{link.href}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function RepoDocList() {
  return (
    <ul className="divide-y divide-charcoal/[0.08]">
      {ADMIN_REPO_DOCS.map((doc) => (
        <li key={doc.path} className="px-5 py-4 sm:px-6">
          <p className="font-mono text-[11px] tracking-[0.12em] uppercase text-navy">{doc.label}</p>
          <p className="mt-1 text-sm text-charcoal/65">{doc.description}</p>
          <p className="mt-1 font-mono text-[10px] text-charcoal/40">{doc.path}</p>
        </li>
      ))}
    </ul>
  );
}

export default function AdminProductDocsPanel() {
  return (
    <div id="admin-product-pages" className="scroll-mt-24 space-y-6">
      <div className="overflow-hidden rounded-2xl border border-charcoal/[0.08] bg-white shadow-sm shadow-charcoal/[0.04]">
        <div className="border-b border-charcoal/[0.08] bg-cream/40 px-5 py-4 sm:px-6">
          <p className="font-mono text-[11px] tracking-[0.2em] uppercase text-gold">Live product pages</p>
        </div>
        <ProductPageGrid />
      </div>

      <div
        id="admin-repo-docs"
        className="scroll-mt-24 overflow-hidden rounded-2xl border border-charcoal/[0.08] bg-white shadow-sm shadow-charcoal/[0.04]"
      >
        <div className="border-b border-charcoal/[0.08] bg-cream/40 px-5 py-4 sm:px-6">
          <p className="font-mono text-[11px] tracking-[0.2em] uppercase text-gold">Repository docs</p>
          <p className="mt-1 text-sm text-charcoal/65">Source files in this workspace.</p>
        </div>
        <RepoDocList />
      </div>
    </div>
  );
}
