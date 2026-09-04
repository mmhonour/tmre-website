/**
 * Opening-night beams on the Spotlight full-bleed hero.
 * Lights only — the fixtures sit off-stage below the frame.
 * Transform lives on the wrapper so the painted cone is not composited
 * away after the first sweep (mask + will-change on one node).
 */
export default function ShowcasePremiereLights() {
  return (
    <div className="spotlight-premiere" aria-hidden>
      <div className="spotlight-premiere-arm spotlight-premiere-arm--a">
        <div className="spotlight-premiere-beam">
          <span className="spotlight-premiere-core" />
        </div>
      </div>
      <div className="spotlight-premiere-arm spotlight-premiere-arm--b">
        <div className="spotlight-premiere-beam">
          <span className="spotlight-premiere-core" />
        </div>
      </div>
    </div>
  );
}
