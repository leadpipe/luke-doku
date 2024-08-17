import {
  Command,
  CompletionState,
  GameInternals,
  isUndoable,
  RecordedCommand,
} from './command';
import {
  ClearCell,
  MarkComplete,
  Pause,
  Redo,
  RedoToEnd,
  Resume,
  SetNum,
  SetNums,
  Undo,
  UndoToStart,
} from './commands';
import {ReadonlyGrid} from './grid';
import {Loc} from './loc';
import {Marks, ReadonlyMarks} from './marks';
import {UndoStack} from './undo-stack';

/**
 * The possible states of a Luke-doku puzzle.
 */
export enum GameState {
  /**
   * The grid of numbers is invisible, and the clock is stopped at 0:00.  No
   * cells have been filled in except the clues.
   */
  UNSTARTED,
  /**
   * The clues are visible, the clock is ticking, and the cells can be filled
   * in.
   */
  RUNNING,
  /**
   * The grid is invisible, like UNSTARTED, but the clock is stopped at some
   * non-zero time.
   */
  PAUSED,
  /**
   * The game is over, either because the grid has been completely filled in and
   * satisfies the Sudoku conditions, or the user has given up. The clock has
   * the total time spent on the puzzle.
   */
  COMPLETE,
}

/** Manages the game state for solving a sudoku interactively. */
export class Game {
  private readonly writableMarks: Marks;
  private readonly history: RecordedCommand[] = [];
  private readonly undoStack: UndoStack = new UndoStack();
  private readonly internals: GameInternals;

  /** Elapsed play time in milliseconds prior to the current period. */
  private priorElapsedMs = 0;
  /** When the current period started, or 0. */
  private resumedTimestamp = 0;

  private gameState = GameState.UNSTARTED;
  private completionState?: CompletionState;

  constructor(readonly puzzle: ReadonlyGrid, history: RecordedCommand[] = []) {
    this.writableMarks = new Marks(puzzle);
    this.internals = {
      marks: this.writableMarks,
      undoStack: this.undoStack,
      executeFromUndoStack: command =>
        this.execute(command, {fromUndoStack: true}),
      resume: () => {
        if (
          this.gameState === GameState.UNSTARTED ||
          this.gameState === GameState.PAUSED
        ) {
          this.resumedTimestamp = Date.now();
          this.gameState = GameState.RUNNING;
          return true;
        }
        return false;
      },
      pause: () => {
        if (this.gameState === GameState.RUNNING) {
          this.priorElapsedMs = this.elapsedMs;
          this.resumedTimestamp = 0;
          this.gameState = GameState.PAUSED;
          return true;
        }
        return false;
      },
      markComplete: completionState => {
        this.internals.pause();
        this.gameState = GameState.COMPLETE;
        this.completionState = completionState;
        return true;
      },
    };
    // Restore historical state.
    for (const {command, elapsedTimestamp} of history) {
      const ok = this.execute(command, {elapsedTimestamp});
      if (!ok) {
        throw new Error(
          `Unable to restore history: failed to execute ${command}`,
        );
      }
    }
  }

  get marks(): ReadonlyMarks {
    return this.writableMarks;
  }

  get state(): GameState {
    return this.gameState;
  }

  get howCompleted(): CompletionState | undefined {
    return this.completionState;
  }

  /**
   * Returns the total elapsed time that the game has been played so far, in
   * milliseconds.
   */
  get elapsedMs(): number {
    let answer = this.priorElapsedMs;
    if (this.resumedTimestamp !== 0) {
      answer += Date.now() - this.resumedTimestamp;
    }
    return answer;
  }

  /**
   * Resumes (or starts for the first time) the clock for this game, if it was
   * previously paused.
   */
  resume() {
    this.execute(new Resume(Date.now()));
  }

  /**
   * Stops the clock for this game, if it was previously running.
   */
  pause() {
    this.execute(new Pause());
  }

  /**
   * Marks this game as solved.
   */
  markComplete(completionState: CompletionState) {
    this.execute(new MarkComplete(completionState));
  }

  clearCell(loc: Loc): boolean {
    return this.execute(new ClearCell(loc));
  }

  setNum(loc: Loc, num: number): boolean {
    return this.execute(new SetNum(loc, num));
  }

  setNums(loc: Loc, nums: ReadonlySet<number>): boolean {
    return this.execute(new SetNums(loc, nums));
  }

  canUndo(): boolean {
    return this.undoStack.canUndo();
  }

  canRedo(): boolean {
    return this.undoStack.canRedo();
  }

  undo(): boolean {
    return this.execute(new Undo());
  }

  redo(): boolean {
    return this.execute(new Redo());
  }

  undoToStart(): boolean {
    return this.execute(new UndoToStart());
  }

  redoToEnd(): boolean {
    return this.execute(new RedoToEnd());
  }

  private execute(
    command: Command,
    opts: {fromUndoStack?: boolean; elapsedTimestamp?: number} = {},
  ): boolean {
    const done = command.execute(
      this.internals,
      opts.elapsedTimestamp ?? this.elapsedMs,
    );
    if (done) {
      this.history.push(done);
      if (!opts.fromUndoStack && isUndoable(done)) {
        this.undoStack.push(done);
      }
    }
    return !!done;
  }
}
