import {
  MAX_BLOCK_LEN,
  MAX_COUNT,
  DEFAULT_MAX_STATES,
  MIN_MAX_STATES,
  MAX_STATES_HARD_CAP,
  CLASSIC_RULES,
  type Player,
  type RuleConfig,
} from "../game/engine";

interface Props {
  status: "idle" | "loading" | "ready" | "error";
  error?: string;
  config: RuleConfig;
  onConfigChange: (config: RuleConfig) => void;
  onStart: (side: Player) => void;
  progress: number;
  maxStates: number;
}

function NumberField({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="rule-field">
      <span>{label}</span>
      <input
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={(e) => {
          const v = Math.round(Number(e.target.value));
          if (Number.isFinite(v)) onChange(Math.min(max, Math.max(min, v)));
        }}
      />
    </label>
  );
}

export default function SetupScreen({ status, error, config, onConfigChange, onStart, progress, maxStates }: Props) {
  const isClassic =
    config.aliceCount === CLASSIC_RULES.aliceCount &&
    config.aliceLen === CLASSIC_RULES.aliceLen &&
    config.bobCount === CLASSIC_RULES.bobCount &&
    config.bobLen === CLASSIC_RULES.bobLen &&
    (config.maxStates ?? DEFAULT_MAX_STATES) === DEFAULT_MAX_STATES;

  const busy = status === "loading";
  const maxStatesValue = config.maxStates ?? DEFAULT_MAX_STATES;
  // While loading, the worker may have clamped/reported a slightly
  // different effective cap than what was requested -- prefer that once we
  // have it.
  const effectiveMax = busy && maxStates > 0 ? maxStates : maxStatesValue;
  const progressPct = effectiveMax > 0 ? Math.min(100, (progress / effectiveMax) * 100) : 0;

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
              <strong>{config.aliceCount}</strong> disjoint <strong>{config.aliceLen}</strong>-letter blocks appear
              that are identical to each other &mdash; any pattern, e.g. <code>XOXOX</code> twice.
            </p>
            <div className="rule-inputs">
              <NumberField
                label="count (A)"
                value={config.aliceCount}
                min={1}
                max={MAX_COUNT}
                onChange={(v) => onConfigChange({ ...config, aliceCount: v })}
              />
              <NumberField
                label="length (n)"
                value={config.aliceLen}
                min={1}
                max={MAX_BLOCK_LEN}
                onChange={(v) => onConfigChange({ ...config, aliceLen: v })}
              />
            </div>
          </div>
          <div className="rule-card rule-bob">
            <h3>Bob wins</h3>
            <p>
              One <strong>{config.bobLen}</strong>-letter pattern appears <strong>{config.bobCount}</strong> separate
              times, disjointly &mdash; e.g. <code>XXO</code> four times.
            </p>
            <div className="rule-inputs">
              <NumberField
                label="count (B)"
                value={config.bobCount}
                min={1}
                max={MAX_COUNT}
                onChange={(v) => onConfigChange({ ...config, bobCount: v })}
              />
              <NumberField
                label="length (m)"
                value={config.bobLen}
                min={1}
                max={MAX_BLOCK_LEN}
                onChange={(v) => onConfigChange({ ...config, bobLen: v })}
              />
            </div>
          </div>
        </div>

        <div className="rule-card rule-limit">
          <h3>Search limit</h3>
          <p>
            The solver gives up gracefully (instead of hanging or crashing the tab) once it's explored this many
            distinct positions.
          </p>
          <div className="rule-inputs">
            <NumberField
              label="max positions"
              value={maxStatesValue}
              min={MIN_MAX_STATES}
              max={MAX_STATES_HARD_CAP}
              onChange={(v) => onConfigChange({ ...config, maxStates: v })}
            />
          </div>
        </div>

        <div className="setup-rule-actions">
          <button className="link-btn" disabled={isClassic} onClick={() => onConfigChange(CLASSIC_RULES)}>
            Reset to classic (A=2, n=5, B=4, m=3)
          </button>
          <p className="setup-warning">
            Larger numbers can take much longer to solve (or exceed the browser's memory) &mdash; the solver will
            report back if a ruleset is too complex rather than hanging.
          </p>
        </div>

        <p className="setup-note">
          Either player can accidentally hand the <em>other</em> player the win &mdash; the string is shared. If one
          move completes both conditions at once, it's a draw.
        </p>

        <div className="setup-actions">
          <p className="setup-prompt">Choose your side:</p>
          <div className="side-buttons">
            <button className="side-btn side-btn-alice" disabled={busy} onClick={() => onStart("A")}>
              Play as Alice
              <span>moves first &middot; hunts {config.aliceLen}-blocks</span>
            </button>
            <button className="side-btn side-btn-bob" disabled={busy} onClick={() => onStart("B")}>
              Play as Bob
              <span>moves second &middot; hunts {config.bobLen}-blocks</span>
            </button>
          </div>

          {status === "loading" && (
            <div className="setup-status" role="status">
              <p>
                <span className="spinner" aria-hidden="true" />
                Solving the full game tree for this ruleset&hellip;
              </p>
              <div className="progress-bar">
                <div className="progress-bar-fill" style={{ width: `${progressPct}%` }} />
              </div>
              <p className="progress-count">
                {progress.toLocaleString()} / {effectiveMax.toLocaleString()} positions explored
              </p>
            </div>
          )}
          {status === "error" && (
            <p className="setup-status setup-error" role="alert">
              {error ?? "Failed to solve this ruleset."}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
