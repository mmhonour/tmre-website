/**
 * The + / − that marks a collapsible group in the /latest and /closed feeds.
 *
 * Presentational on purpose: the whole header row is the button on every feed
 * that uses this, and a nested <button> would be invalid markup. The owning
 * header carries `group` plus `aria-expanded`.
 */
export default function FeedCollapseSign({
  collapsed,
  size = "sm",
}: {
  collapsed: boolean;
  /** `md` for the taller mobile group headers. */
  size?: "sm" | "md";
}) {
  return (
    <span
      className={`inline-flex ${
        size === "md" ? "h-7 w-7" : "h-6 w-6"
      } shrink-0 items-center justify-center rounded-md border border-charcoal/20 bg-white text-navy/75 shadow-sm transition-colors group-hover:border-gold/40 group-hover:text-navy`}
      aria-hidden
    >
      <svg
        viewBox="0 0 16 16"
        className="h-3.5 w-3.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      >
        <path d="M3.5 8h9" />
        {collapsed ? <path d="M8 3.5v9" /> : null}
      </svg>
    </span>
  );
}
