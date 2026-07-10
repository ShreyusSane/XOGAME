import { useEffect, useState } from "react";
import type { ChildEvaluation, Player } from "../game/engine";
import type { ChildrenResult } from "../game/useEngine";

interface TreeNodeProps {
  moves: string;
  move: "X" | "O" | null; // move that led to this node, null for the tree root
  result: ChildEvaluation["result"] | undefined; // undefined only for the true root
  movesRemaining: number | undefined;
  isOptimal: boolean;
  depth: number;
  actualMoves: string;
  evaluateChildren: (moves: string) => Promise<ChildrenResult>;
  onPreview: (moves: string) => void;
  previewMoves: string | null;
}

function resultShort(result: ChildEvaluation["result"]): string {
  if (result === "A") return "Alice";
  if (result === "B") return "Bob";
  if (result === "Draw") return "Draw";
  return "?";
}

function resultClass(result: ChildEvaluation["result"]): string {
  if (result === "A") return "alice";
  if (result === "B") return "bob";
  if (result === "Draw") return "draw";
  return "";
}

function TreeNode({
  moves,
  move,
  result,
  movesRemaining,
  isOptimal,
  depth,
  actualMoves,
  evaluateChildren,
  onPreview,
  previewMoves,
}: TreeNodeProps) {
  const isTerminal = movesRemaining === 1;
  const onActualPath = actualMoves.startsWith(moves);
  const isNextActualStep = onActualPath && actualMoves.length === moves.length;
  const wasActuallyPlayed = move !== null && actualMoves.length >= moves.length && actualMoves.startsWith(moves);

  // `expanded` has two sources: an automatic default (always on for the
  // root, and for any node on the actually-played path so the real game so
  // far is always visible) and an optional manual override once the user
  // clicks the toggle. The auto default must stay reactive to actualMoves
  // growing as the game progresses, not just be computed once at mount.
  const autoExpanded = depth === 0 || (onActualPath && depth < 40);
  const [manualExpanded, setManualExpanded] = useState<boolean | null>(null);
  const expanded = manualExpanded ?? autoExpanded;
  const [children, setChildren] = useState<ChildrenResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [turn, setTurn] = useState<Player | null>(null);

  useEffect(() => {
    setChildren(null);
    setTurn(null);
    setManualExpanded(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [moves]);

  useEffect(() => {
    if (!expanded || isTerminal || children || loading) return;
    let cancelled = false;
    setLoading(true);
    evaluateChildren(moves).then((res) => {
      if (!cancelled) {
        setChildren(res);
        setTurn(res.turn);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [expanded, isTerminal, children, loading, moves, evaluateChildren]);

  const isSelected = previewMoves === moves;

  return (
    <li className={`tree-node ${onActualPath ? "tree-node-actual" : ""}`}>
      <div
        className={`tree-row ${result ? `tree-row-${resultClass(result)}` : ""} ${isOptimal ? "tree-row-optimal" : ""} ${isSelected ? "tree-row-selected" : ""}`}
      >
        {!isTerminal ? (
          <button
            className="tree-toggle"
            onClick={() => setManualExpanded(!expanded)}
            aria-expanded={expanded}
            aria-label={expanded ? "Collapse" : "Expand"}
          >
            {expanded ? "−" : "+"}
          </button>
        ) : (
          <span className="tree-toggle tree-toggle-leaf" aria-hidden="true">
            &bull;
          </span>
        )}

        {move !== null && (
          <button className={`tree-move tile-${move.toLowerCase()}`} onClick={() => onPreview(moves)} title="Preview this position on the board">
            {move}
          </button>
        )}
        {move === null && (
          <button className="tree-move tree-move-root" onClick={() => onPreview(moves)} title="Preview this position on the board">
            &#8962;
          </button>
        )}

        {isOptimal && <span className="badge-best" title="The optimal move for the player to move">best</span>}
        {wasActuallyPlayed && move !== null && <span className="badge-actual">played</span>}

        <span className="tree-label">
          {result ? (
            <>
              {resultShort(result)}
              {result !== "Draw" ? " wins" : ""} in {movesRemaining}
            </>
          ) : (
            "root"
          )}
        </span>
      </div>
      {isNextActualStep && <div className="tree-turn-note tree-here">&larr; game is here</div>}

      {expanded && !isTerminal && (
        <div className="tree-children">
          {loading && !children && <div className="tree-loading">solving&hellip;</div>}
          {turn && children && <div className="tree-turn-note">{turn === "A" ? "Alice" : "Bob"} to move</div>}
          {children && (
            <ul>
              {children.children.map((c) => (
                <TreeNode
                  key={c.move}
                  moves={moves + c.move}
                  move={c.move}
                  result={c.result}
                  movesRemaining={c.movesRemaining}
                  isOptimal={c.isOptimal}
                  depth={depth + 1}
                  actualMoves={actualMoves}
                  evaluateChildren={evaluateChildren}
                  onPreview={onPreview}
                  previewMoves={previewMoves}
                />
              ))}
            </ul>
          )}
        </div>
      )}
    </li>
  );
}

interface Props {
  rootMoves: string;
  actualMoves: string;
  evaluateChildren: (moves: string) => Promise<ChildrenResult>;
  onPreview: (moves: string) => void;
  previewMoves: string | null;
}

export default function GameTree({ rootMoves, actualMoves, evaluateChildren, onPreview, previewMoves }: Props) {
  return (
    <div className="game-tree">
      <ul className="tree-root-list">
        <TreeNode
          moves={rootMoves}
          move={null}
          result={undefined}
          movesRemaining={undefined}
          isOptimal={false}
          depth={0}
          actualMoves={actualMoves}
          evaluateChildren={evaluateChildren}
          onPreview={onPreview}
          previewMoves={previewMoves}
        />
      </ul>
    </div>
  );
}
