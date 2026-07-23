/** Circular undo/reset control used by Intelligence sliders and listing criteria. */
export default function FilterResetButton({
  onClick,
  disabled = false,
  label = "Reset",
  tone = "onDark",
}: {
  onClick: () => void;
  disabled?: boolean;
  label?: string;
  /** `onDark` → white icon (navy panels); `onLight` → navy icon (cream/modals). */
  tone?: "onDark" | "onLight";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={`shrink-0 inline-flex h-6 w-6 items-center justify-center rounded-full transition-opacity hover:opacity-80 disabled:opacity-30 disabled:pointer-events-none ${
        tone === "onLight" ? "text-navy" : "text-white"
      }`}
    >
      <svg
        viewBox="0 0 24 24"
        className="h-3.5 w-3.5"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <polyline points="1 4 1 10 7 10" />
        <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
      </svg>
    </button>
  );
}
