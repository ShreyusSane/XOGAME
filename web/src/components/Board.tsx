import { turnOf } from "../game/rules";

interface Props {
  moves: string;
  highlightRanges: [number, number][];
}

export default function Board({ moves, highlightRanges }: Props) {
  const highlighted = new Array(moves.length).fill(false);
  for (const [start, end] of highlightRanges) {
    for (let i = start; i < end && i < moves.length; i++) highlighted[i] = true;
  }

  return (
    <div className="board" role="list" aria-label="Move sequence">
      {moves.length === 0 && <div className="board-empty">No moves yet &mdash; the board starts empty.</div>}
      {moves.split("").map((ch, i) => {
        const player = turnOf(i + 1);
        return (
          <div
            key={i}
            role="listitem"
            className={`tile tile-${ch.toLowerCase()} ${highlighted[i] ? "tile-highlight" : ""}`}
            title={`Move ${i + 1}: ${player === "A" ? "Alice" : "Bob"} played ${ch}`}
          >
            <span className="tile-char">{ch}</span>
            <span className="tile-index">{i + 1}</span>
          </div>
        );
      })}
    </div>
  );
}
