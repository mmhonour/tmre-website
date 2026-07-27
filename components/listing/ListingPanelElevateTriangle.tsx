/**
 * Plain 3D-looking elevate control for desktop Remarks / Details / History.
 * Gold when pointing up (elevate / maximize), white when pointing down (restore).
 */
export default function ListingPanelElevateTriangle({
  pointing,
  className = "",
}: {
  pointing: "up" | "down";
  className?: string;
}) {
  const color = pointing === "up" ? "text-gold" : "text-white";
  return (
    <span
      className={`inline-block text-[11px] leading-none select-none ${color} ${className}`.trim()}
      style={{
        textShadow:
          pointing === "up"
            ? "0 1px 0 rgba(0,0,0,0.55), 0 2px 3px rgba(0,0,0,0.35), 0 -0.5px 0 rgba(255,220,120,0.35)"
            : "0 1px 0 rgba(0,0,0,0.45), 0 2px 3px rgba(0,0,0,0.3), 0 -0.5px 0 rgba(255,255,255,0.35)",
      }}
      aria-hidden
    >
      {pointing === "up" ? "▲" : "▼"}
    </span>
  );
}
