"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import type { ComponentProps } from "react";
import { appendReturnToHref, buildReturnPath } from "@/lib/listing-return-nav";

/** Current page path (+ query) for listing Back / `?from=`. */
export function useCurrentReturnPath(): string {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const search = searchParams.toString();
  return buildReturnPath(pathname, search ? `?${search}` : "");
}

type ListingReturnLinkProps = Omit<ComponentProps<typeof Link>, "href"> & {
  href: string;
};

export default function ListingReturnLink({
  href,
  ...props
}: ListingReturnLinkProps) {
  const returnPath = useCurrentReturnPath();
  const [resolvedHref, setResolvedHref] = useState(href);

  useEffect(() => {
    const hash = window.location.hash || "";
    setResolvedHref(appendReturnToHref(href, `${returnPath}${hash}`));
  }, [href, returnPath]);

  return <Link href={resolvedHref} {...props} />;
}
