import type { Player, Result } from "../game/engine";

interface Props {
  humanSide: Player;
  liveResult: Result; // actual game-over result, if the game has ended
  evaluation: { result: Result; movesRemaining: number } | null; // forced outcome from here, if game ongoing
  movesPlayed: number;
}

function resultLabel(result: Exclude<Result, null>): string {
  if (result === "A") return "Alice";
  if (result === "B") return "Bob";
  return "Draw";
}

function resultClass(result: Exclude<Result, null>): string {
  if (result === "A") return "alice";
  if (result === "B") return "bob";
  return "draw";
}

export default function EvaluationBanner({ humanSide, liveResult, evaluation, movesPlayed }: Props) {
  if (liveResult !== null) {
    const cls = resultClass(liveResult);
    const won = liveResult === humanSide;
    const message =
      liveResult === "Draw"
        ? "Draw — both conditions completed on the same move"
        : `${resultLabel(liveResult)} wins${liveResult === humanSide ? " — that's you!" : ""}`;
    return (
      <div className={`eval-banner eval-final eval-${cls}`} role="status">
        <div className="eval-headline">
          <span className="eval-dot" />
          {message}
        </div>
        <div className="eval-sub">
          Game ended in {movesPlayed} move{movesPlayed === 1 ? "" : "s"}
          {liveResult !== "Draw" && (won ? " — nice." : " — better luck next time.")}
        </div>
      </div>
    );
  }

  if (evaluation === null) {
    return (
      <div className="eval-banner eval-loading" role="status">
        <span className="spinner" aria-hidden="true" />
        Evaluating position&hellip;
      </div>
    );
  }

  const { result, movesRemaining } = evaluation;
  if (result === null) {
    return (
      <div className="eval-banner eval-unknown" role="status">
        Position not yet resolved.
      </div>
    );
  }

  const cls = resultClass(result);
  const forYou = result === humanSide;
  const verb = result === "Draw" ? "Forced draw" : `${resultLabel(result)} forced to win`;

  return (
    <div className={`eval-banner eval-${cls}`} role="status">
      <div className="eval-headline">
        <span className="eval-dot" />
        {verb} in {movesRemaining} more move{movesRemaining === 1 ? "" : "s"}
        {result !== "Draw" && (
          <span className="eval-forme">{forYou ? " — you're ahead" : " — you're behind"}</span>
        )}
      </div>
      <div className="eval-sub">assuming optimal play by both sides from here</div>
    </div>
  );
}
