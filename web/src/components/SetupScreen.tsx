import type { Player } from "../game/engine";

interface Props {
  status: "loading" | "ready" | "error";
  error?: string;
  onStart: (side: Player) => void;
}

export default function SetupScreen({ status, error, onStart }: Props) {
  return (
    <div className="setup">
      <div className="setup-card">
        <h1>
          Alice <span className="vs">vs</span> Bob
        </h1>
        <p className="setup-tagline">
          Two players build one string of <strong className="tile-x">X</strong>'s and{" "}
          <strong className="tile-o">O</strong>'s, alternating turns.
        </p>

        <div className="rules-grid">
          <div className="rule-card rule-alice">
            <h3>Alice wins</h3>
            <p>
              2 disjoint 5-letter blocks appear that are identical to each other &mdash; any pattern, e.g.
              <code>XOXOX</code> twice.
            </p>
          </div>
          <div className="rule-card rule-bob">
            <h3>Bob wins</h3>
            <p>
              One 3-letter pattern appears 4 separate times, disjointly &mdash; e.g. <code>XXO</code> four times.
            </p>
          </div>
        </div>
        <p className="setup-note">
          Either player can accidentally hand the <em>other</em> player the win &mdash; the string is shared. If one
          move completes both conditions at once, it's a draw.
        </p>

        <div className="setup-actions">
          <p className="setup-prompt">Choose your side:</p>
          <div className="side-buttons">
            <button
              className="side-btn side-btn-alice"
              disabled={status !== "ready"}
              onClick={() => onStart("A")}
            >
              Play as Alice
              <span>moves first &middot; hunts 5-blocks</span>
            </button>
            <button className="side-btn side-btn-bob" disabled={status !== "ready"} onClick={() => onStart("B")}>
              Play as Bob
              <span>moves second &middot; hunts 3-blocks</span>
            </button>
          </div>

          {status === "loading" && (
            <p className="setup-status" role="status">
              <span className="spinner" aria-hidden="true" />
              Solving the full game tree (one-time, a few seconds)&hellip;
            </p>
          )}
          {status === "error" && (
            <p className="setup-status setup-error" role="alert">
              Failed to load the solver{error ? `: ${error}` : ""}.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
