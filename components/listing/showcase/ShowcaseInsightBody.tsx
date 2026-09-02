import { ListingInsightCopy } from "@/components/listing/ListingInsightCopy";

/** Shared insight on top; showcase facts prose underneath. */
export default function ShowcaseInsightBody({
  insight,
  facts,
  className = "text-sm leading-relaxed text-white/80",
}: {
  insight: string | null;
  facts: string | null;
  className?: string;
}) {
  if (!insight && !facts) {
    return (
      <p className="text-sm text-white/50">No insight for this listing.</p>
    );
  }
  return (
    <>
      {insight ? (
        <ListingInsightCopy text={insight} className={className} />
      ) : null}
      {facts ? (
        <p className={insight ? `mt-3 ${className}` : className}>{facts}</p>
      ) : null}
    </>
  );
}
