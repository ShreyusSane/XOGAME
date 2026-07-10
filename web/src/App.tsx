import { useCallback, useEffect, useRef, useState } from "react";
import "./App.css";
import { useEngine } from "./game/useEngine";
import { simulate, winningBlocks, turnOf } from "./game/rules";
import { CLASSIC_RULES, type Player, type ChildEvaluation, type Result, type RuleConfig } from "./game/engine";
import SetupScreen from "./components/SetupScreen";
import EvaluationBanner from "./components/EvaluationBanner";
import Board from "./components/Board";
import MoveControls from "./components/MoveControls";
import GameTree from "./components/GameTree";

type Phase = "setup" | "playing";

function sameConfig(a: RuleConfig, b: RuleConfig): boolean {
  return a.aliceLen === b.aliceLen && a.aliceCount === b.aliceCount && a.bobLen === b.bobLen && a.bobCount === b.bobCount;
}

function App() {
  const engine = useEngine();
  const [phase, setPhase] = useState<Phase>("setup");
  const [humanSide, setHumanSide] = useState<Player>("A");
  const [rulesConfig, setRulesConfig] = useState<RuleConfig>(CLASSIC_RULES);
  const [moves, setMoves] = useState("");
  const [evaluation, setEvaluation] = useState<{ result: Result; movesRemaining: number } | null>(null);
  const [hints, setHints] = useState<ChildEvaluation[] | null>(null);
  const [showHints, setShowHints] = useState(false);
  const [botThinking, setBotThinking] = useState(false);
  const [treeAtStart, setTreeAtStart] = useState(true);
  const [previewMoves, setPreviewMoves] = useState<string | null>(null);

  const configuredFor = useRef<RuleConfig | null>(null);
  const pendingSide = useRef<Player | null>(null);

  const sim = simulate(moves, rulesConfig);
  const isOver = sim.winner !== null;
  const currentTurn = turnOf(moves.length + 1);
  const isHumanTurn = !isOver && currentTurn === humanSide;

  const lastRequestedMoves = useRef<string | null>(null);

  const beginPlaying = useCallback((side: Player) => {
    setHumanSide(side);
    setMoves("");
    setEvaluation(null);
    setHints(null);
    setPreviewMoves(null);
    setTreeAtStart(true);
    setPhase("playing");
  }, []);

  const startGame = useCallback(
    (side: Player) => {
      pendingSide.current = side;
      if (configuredFor.current && sameConfig(configuredFor.current, rulesConfig) && engine.status === "ready") {
        beginPlaying(side);
        pendingSide.current = null;
      } else {
        configuredFor.current = rulesConfig;
        engine.configure(rulesConfig);
      }
    },
    [rulesConfig, engine, beginPlaying],
  );

  // Once a pending "start" request's solve completes, actually enter the game.
  useEffect(() => {
    if (pendingSide.current && engine.status === "ready") {
      beginPlaying(pendingSide.current);
      pendingSide.current = null;
    }
    if (engine.status === "error") {
      pendingSide.current = null;
    }
  }, [engine.status, beginPlaying]);

  const playMove = useCallback((ch: "X" | "O") => {
    setMoves((m) => m + ch);
    setHints(null);
  }, []);

  // Fetch the live evaluation for the current position whenever it changes.
  useEffect(() => {
    if (engine.status !== "ready" || isOver) {
      setEvaluation(null);
      return;
    }
    let cancelled = false;
    lastRequestedMoves.current = moves;
    engine.evaluate(moves).then((ev) => {
      if (!cancelled && lastRequestedMoves.current === moves) {
        setEvaluation({ result: ev.result, movesRemaining: ev.movesRemaining });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [moves, engine, isOver]);

  // Fetch hints for the human's own turn, only when requested.
  useEffect(() => {
    if (!showHints || !isHumanTurn || engine.status !== "ready") {
      return;
    }
    let cancelled = false;
    engine.evaluateChildren(moves).then((res) => {
      if (!cancelled) setHints(res.children);
    });
    return () => {
      cancelled = true;
    };
  }, [showHints, isHumanTurn, moves, engine]);

  // Bot auto-play.
  useEffect(() => {
    if (phase !== "playing" || engine.status !== "ready" || isOver) return;
    if (currentTurn === humanSide) return;
    let cancelled = false;
    setBotThinking(true);
    const movesAtRequest = moves;
    engine.evaluate(movesAtRequest).then((ev) => {
      if (cancelled) return;
      const delay = 550;
      window.setTimeout(() => {
        if (cancelled) return;
        setMoves((m) => (m === movesAtRequest ? m + ev.bestMove : m));
        setBotThinking(false);
      }, delay);
    });
    return () => {
      cancelled = true;
      setBotThinking(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [moves, phase, engine.status, isOver, currentTurn, humanSide]);

  const winBlocks = isOver ? winningBlocks(moves, rulesConfig) : null;

  const resetToSetup = () => {
    setPhase("setup");
    setMoves("");
    setPreviewMoves(null);
  };

  const rematch = () => {
    setMoves("");
    setEvaluation(null);
    setHints(null);
    setPreviewMoves(null);
    setTreeAtStart(true);
  };

  if (phase === "setup") {
    return (
      <SetupScreen
        status={pendingSide.current ? engine.status : engine.status === "error" ? "error" : "idle"}
        error={engine.error}
        config={rulesConfig}
        onConfigChange={setRulesConfig}
        onStart={startGame}
      />
    );
  }

  const treeRoot = treeAtStart ? "" : moves;

  return (
    <div className="app">
      <header className="app-header">
        <h1>
          Alice <span className="vs">vs</span> Bob
        </h1>
        <div className="app-header-meta">
          <span className={`side-chip side-chip-${humanSide === "A" ? "alice" : "bob"}`}>
            You are {humanSide === "A" ? "Alice" : "Bob"}
          </span>
          <span className="engine-meta">
            rules: A={rulesConfig.aliceCount}&times;{rulesConfig.aliceLen}, B={rulesConfig.bobCount}&times;
            {rulesConfig.bobLen}
          </span>
          {engine.status === "ready" && (
            <span className="engine-meta">
              solver: {engine.memoSize.toLocaleString()} positions &middot; {(engine.timeMs / 1000).toFixed(1)}s
            </span>
          )}
          <button className="link-btn" onClick={rematch}>
            Rematch
          </button>
          <button className="link-btn" onClick={resetToSetup}>
            Change side / rules
          </button>
        </div>
      </header>

      <main className="app-main">
        <section className="panel play-panel">
          <EvaluationBanner
            humanSide={humanSide}
            liveResult={sim.winner}
            evaluation={evaluation}
            movesPlayed={moves.length}
          />

          <Board moves={moves} highlightRanges={winBlocks?.ranges ?? []} />

          {!isOver && (
            <div className="turn-row">
              <span className={`turn-indicator turn-${currentTurn === "A" ? "alice" : "bob"}`}>
                {currentTurn === "A" ? "Alice" : "Bob"}
                {currentTurn === humanSide ? " (you)" : " (bot)"} to move
              </span>
              {botThinking && (
                <span className="thinking">
                  <span className="spinner" aria-hidden="true" /> thinking&hellip;
                </span>
              )}
            </div>
          )}

          {isHumanTurn && !botThinking && (
            <MoveControls
              disabled={engine.status !== "ready"}
              onPlay={playMove}
              hints={hints}
              showHints={showHints}
              onToggleHints={() => setShowHints((s) => !s)}
            />
          )}

          {isOver && (
            <button className="primary-btn" onClick={rematch}>
              Play again
            </button>
          )}
        </section>

        <section className="panel tree-panel">
          <div className="tree-panel-header">
            <h2>Game tree</h2>
            <div className="tree-root-toggle">
              <button className={treeAtStart ? "active" : ""} onClick={() => setTreeAtStart(true)}>
                From start
              </button>
              <button className={!treeAtStart ? "active" : ""} onClick={() => setTreeAtStart(false)}>
                Current position
              </button>
            </div>
          </div>
          <p className="tree-help">
            Click <span className="tree-move-example">+</span> to expand a line, click a move tile to preview it on
            the board below. The path actually played is auto-expanded and marked with a coloured edge.
          </p>

          {previewMoves !== null && (
            <div className="preview-strip">
              <div className="preview-strip-header">
                <span>Previewing hypothetical line ({previewMoves.length} moves)</span>
                <button className="link-btn" onClick={() => setPreviewMoves(null)}>
                  Close
                </button>
              </div>
              <Board moves={previewMoves} highlightRanges={winningBlocks(previewMoves, rulesConfig)?.ranges ?? []} />
            </div>
          )}

          {engine.status === "ready" ? (
            <GameTree
              rootMoves={treeRoot}
              actualMoves={moves}
              evaluateChildren={engine.evaluateChildren}
              onPreview={setPreviewMoves}
              previewMoves={previewMoves}
            />
          ) : (
            <div className="tree-loading">
              <span className="spinner" aria-hidden="true" /> waiting for solver&hellip;
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

export default App;
