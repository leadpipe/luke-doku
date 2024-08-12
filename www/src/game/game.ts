import {ReadonlyGrid} from './grid';
import {Marks} from './marks';

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

/**
 * The possible ways of completing a Luke-doku puzzle.
 */
export enum CompletionState {
  /** You solved the puzzle. */
  SOLVED,
  /** You quit before you'd solved it. */
  QUIT,
  /** You solved it but then guessed wrong about how many solutions there were. */
  SOLVED_OOPS,
}

/** Manages the game state for solving a sudoku interactively. */
export class Game {
  readonly marks: Marks;

  /** Elapsed play time in milliseconds prior to the current period. */
  private priorElapsedMs = 0;
  /** When the current period started, or 0. */
  private resumedTimestamp = 0;

  private gameState = GameState.UNSTARTED;
  private completionState?: CompletionState;

  constructor(readonly puzzle: ReadonlyGrid) {
    this.marks = new Marks(puzzle);
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
    if (
      this.gameState === GameState.UNSTARTED ||
      this.gameState === GameState.PAUSED
    ) {
      this.resumedTimestamp = Date.now();
      this.gameState = GameState.RUNNING;
    }
  }

  /**
   * Stops the clock for this game, if it was previously running.
   */
  pause() {
    if (this.gameState === GameState.RUNNING) {
      this.priorElapsedMs = this.elapsedMs;
      this.resumedTimestamp = 0;
      this.gameState = GameState.PAUSED;
    }
  }

  /**
   * Marks this game as solved.
   */
  markComplete(completionState: CompletionState) {
    this.pause();
    this.gameState = GameState.COMPLETE;
    this.completionState = completionState;
  }
}
