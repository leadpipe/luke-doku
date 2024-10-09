import {
  Command,
  CompletionState,
  GameInternals,
  isUndoable,
  RecordedCommand,
} from './command';
import {
  ActivateTrail,
  ArchiveTrail,
  ClearCell,
  CopyFromTrail,
  CreateTrail,
  MarkComplete,
  Pause,
  Redo,
  RedoToEnd,
  Resume,
  SetNum,
  SetNums,
  ToggleTrailsActive,
  ToggleTrailVisibility,
  Undo,
  UndoToStart,
} from './commands';
import {ReadonlyGrid} from './grid';
import {Loc} from './loc';
import {Marks, ReadonlyMarks} from './marks';
import {ReadonlyTrail} from './trail';
import {ReadonlyTrails, Trails} from './trails';
import {UndoStack} from './undo-stack';

/** Manages the game state for solving a sudoku interactively. */
export class Game {
  private writableMarks: Marks;
  private readonly writableHistory: RecordedCommand[] = [];
  private readonly undoStack: UndoStack = new UndoStack();
  private writableTrails: Trails;
  private readonly internals: GameInternals;

  /** Elapsed play time in milliseconds prior to the current period. */
  private priorElapsedMs = 0;
  /** When the current period started, or 0. */
  private resumedTimestamp = 0;

  private gameState = GameState.UNSTARTED;
  private completionState?: CompletionState;

  constructor(
    readonly puzzle: ReadonlyGrid,
    history: readonly RecordedCommand[] = [],
  ) {
    this.writableMarks = new Marks(puzzle);
    this.writableTrails = new Trails();
    const game = this;
    const getMarks = () => this.writableMarks;
    const setMarks = (marks: Marks) => (this.writableMarks = marks);
    const getTrails = () => this.writableTrails;
    const setTrails = (trails: Trails) => (this.writableTrails = trails);
    this.internals = {
      undoStack: this.undoStack,
      get elapsedMs(): number {
        return game.elapsedMs;
      },
      get marks(): Marks {
        return getMarks();
      },
      set marks(marks: Marks) {
        setMarks(marks);
      },
      get trails(): Trails {
        return getTrails();
      },
      set trails(trails: Trails) {
        setTrails(trails);
      },
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
      const ok = this.execute(command, elapsedTimestamp);
      if (!ok) {
        throw new Error(
          `Unable to restore history: failed to execute ${command}`,
        );
      }
    }
  }

  get history(): readonly RecordedCommand[] {
    return this.writableHistory;
  }

  get marks(): ReadonlyMarks {
    return this.writableMarks;
  }

  get trails(): ReadonlyTrails {
    return this.writableTrails;
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

  createTrail(): boolean {
    return this.execute(new CreateTrail());
  }

  activateTrail(trail: ReadonlyTrail): boolean {
    return this.execute(new ActivateTrail(trail.id));
  }

  toggleTrailVisibility(trail: ReadonlyTrail): boolean {
    return this.execute(new ToggleTrailVisibility(trail.id));
  }

  archiveTrail(trail: ReadonlyTrail): boolean {
    return this.execute(new ArchiveTrail(trail.id));
  }

  toggleTrailsActive(): boolean {
    return this.execute(new ToggleTrailsActive());
  }

  copyFromTrail(trail: ReadonlyTrail): boolean {
    return this.execute(new CopyFromTrail(trail.id));
  }

  private execute(command: Command, elapsedTimestamp?: number): boolean {
    const done = command.execute(
      this.internals,
      elapsedTimestamp ?? this.elapsedMs,
    );
    if (done) {
      this.writableHistory.push(done);
      if (isUndoable(done)) {
        this.undoStack.push(done);
      }
    }
    return !!done;
  }
}

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
   * The number are visible, the clock is ticking, and the cells can be filled
   * in.
   */
  RUNNING,
  /**
   * The numbers are invisible, like UNSTARTED, but the clock is stopped at some
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
