export const navIconClass = "w-6 h-6 shrink-0";

export function PhoneIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className ?? navIconClass}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      aria-hidden
    >
      <path
        d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2h-1A14 14 0 0 1 3 6V5a2 2 0 0 1 2-2z"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
