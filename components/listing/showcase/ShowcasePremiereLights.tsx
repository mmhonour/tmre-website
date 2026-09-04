/**
 * Opening-night beams on the Spotlight full-bleed hero.
 * Lights only — the fixtures sit off-stage below the frame.
 */
export default function ShowcasePremiereLights() {
  return (
    <div className="spotlight-premiere" aria-hidden>
      <div className="spotlight-premiere-beam spotlight-premiere-beam--a">
        <span className="spotlight-premiere-core" />
      </div>
      <div className="spotlight-premiere-beam spotlight-premiere-beam--b">
        <span className="spotlight-premiere-core" />
      </div>
    </div>
  );
}
