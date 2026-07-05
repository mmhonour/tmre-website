import type { ReactNode } from "react";

export default function ListingTabLayout({
  main,
  sidebar,
}: {
  main: ReactNode;
  sidebar: ReactNode;
}) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_min(22rem,32vw)] gap-7 lg:gap-10 items-start">
      <div className="min-w-0 space-y-6">{main}</div>
      {sidebar}
    </div>
  );
}
