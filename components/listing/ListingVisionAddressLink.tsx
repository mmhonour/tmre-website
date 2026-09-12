"use client";

import Link from "next/link";
import type { ReactNode } from "react";

/** Street line that opens the Vision / VGSI card. Admin-only at the call site. */
export function ListingVisionAddressLink({
  href,
  children,
  className = "",
}: {
  href: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={`underline decoration-gold/45 underline-offset-[0.18em] transition-colors hover:text-gold ${className}`}
      title="Open Vision / VGSI card"
    >
      {children}
    </Link>
  );
}
