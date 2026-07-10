"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import type { ComponentProps } from "react";
import { appendReturnToHref, buildReturnPath } from "@/lib/listing-return-nav";

type ListingReturnLinkProps = Omit<ComponentProps<typeof Link>, "href"> & {
  href: string;
};

export default function ListingReturnLink({
  href,
  ...props
}: ListingReturnLinkProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [resolvedHref, setResolvedHref] = useState(href);

  useEffect(() => {
    const search = searchParams.toString();
    const returnPath = buildReturnPath(
      pathname,
      search ? `?${search}` : "",
      window.location.hash,
    );
    setResolvedHref(appendReturnToHref(href, returnPath));
  }, [href, pathname, searchParams]);

  return <Link href={resolvedHref} {...props} />;
}
