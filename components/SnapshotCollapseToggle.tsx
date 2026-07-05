export default function SnapshotCollapseToggle({
  expanded,
  onToggle,
  label,
}: {
  expanded: boolean;
  onToggle: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={expanded}
      aria-label={expanded ? `Minimize ${label} stats` : `Expand ${label} stats`}
      className="inline-flex h-6 w-6 shrink-0 items-center justify-center text-white/55 hover:text-gold transition-colors"
    >
      <span
        aria-hidden
        className={`inline-block h-0 w-0 ${
          expanded
            ? "border-l-[5px] border-r-[5px] border-t-[6px] border-l-transparent border-r-transparent border-t-current"
            : "border-t-[5px] border-b-[5px] border-l-[6px] border-t-transparent border-b-transparent border-l-current"
        }`}
      />
    </button>
  );
}
