import type { ChildEvaluation } from "../game/engine";

interface Props {
  disabled: boolean;
  onPlay: (move: "X" | "O") => void;
  hints: ChildEvaluation[] | null;
  showHints: boolean;
  onToggleHints: () => void;
}

function hintLabel(c: ChildEvaluation): string {
  if (c.result === null) return "unresolved";
  if (c.result === "Draw") return `draw in ${c.movesRemaining}`;
  const who = c.result === "A" ? "Alice" : "Bob";
  return `${who} wins in ${c.movesRemaining}`;
}

export default function MoveControls({ disabled, onPlay, hints, showHints, onToggleHints }: Props) {
  const forChar = (ch: "X" | "O") => hints?.find((h) => h.move === ch) ?? null;

  return (
    <div className="move-controls">
      <div className="move-buttons">
        {(["X", "O"] as const).map((ch) => {
          const hint = showHints ? forChar(ch) : null;
          return (
            <button
              key={ch}
              className={`move-btn move-btn-${ch.toLowerCase()} ${hint?.isOptimal ? "move-btn-optimal" : ""}`}
              disabled={disabled}
              onClick={() => onPlay(ch)}
            >
              <span className="move-btn-char">{ch}</span>
              {hint && (
                <span className="move-btn-hint">
                  {hintLabel(hint)}
                  {hint.isOptimal && <span className="badge-best">best</span>}
                </span>
              )}
            </button>
          );
        })}
      </div>
      <label className="hint-toggle">
        <input type="checkbox" checked={showHints} onChange={onToggleHints} disabled={disabled} />
        Show move hints
      </label>
    </div>
  );
}
