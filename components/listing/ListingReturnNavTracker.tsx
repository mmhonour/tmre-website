"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import {
  buildReturnPath,
  isListingPath,
  labelForReturnPath,
  parseReturnFromSearchParams,
  persistReturnNav,
} from "@/lib/listing-return-nav";

function pathnameFromReturnHref(href: string): string {
  const qIdx = href.indexOf("?");
  const hashIdx = href.indexOf("#");
  const end =
    qIdx >= 0 && hashIdx >= 0
      ? Math.min(qIdx, hashIdx)
      : qIdx >= 0
        ? qIdx
        : hashIdx >= 0
          ? hashIdx
          : href.length;
  return href.slice(0, end);
}

export default function ListingReturnNavTracker() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const prevPathRef = useRef<string | null>(null);
  const [hash, setHash] = useState("");

  useEffect(() => {
    const updateHash = () => {
      setHash(window.location.hash);
    };
    updateHash();
    window.addEventListener("hashchange", updateHash);
    return () => window.removeEventListener("hashchange", updateHash);
  }, []);

  useEffect(() => {
    const search = searchParams.toString();
    const currentPath = buildReturnPath(
      pathname,
      search ? `?${search}` : "",
      hash,
    );
    const prevPath = prevPathRef.current;

    if (isListingPath(pathname)) {
      const fromNav = parseReturnFromSearchParams(searchParams);
      if (fromNav) {
        persistReturnNav(fromNav);
      } else if (
        prevPath &&
        !isListingPath(pathnameFromReturnHref(prevPath))
      ) {
        persistReturnNav({
          href: prevPath,
          label: labelForReturnPath(prevPath),
        });
      }
    }

    prevPathRef.current = currentPath;
  }, [pathname, searchParams, hash]);

  return null;
}
