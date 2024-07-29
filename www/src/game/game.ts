import {ReadonlyGrid} from './grid';
import {Marks} from './marks';

/** Manages the game state for solving a sudoku interactively. */
export class Game {
  readonly marks: Marks;

  /** Elapsed play time in milliseconds prior to the current period. */
  private priorElapsedMs = 0;
  /** When the current period started, or 0. */
  private resumedTimestamp = 0;

  constructor(readonly puzzle: ReadonlyGrid) {
    this.marks = new Marks(puzzle);
  }

  /**
   * Tells whether this game has started.
   */
  get isStarted(): boolean {
    return this.priorElapsedMs > 0 || !this.isPaused;
  }

  /**
   * Tells whether the game is currently paused.  Games always start paused, and
   * only are unpaused with the initial call to `resume`.
   */
  get isPaused(): boolean {
    return this.resumedTimestamp === 0;
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
    if (this.isPaused) {
      this.resumedTimestamp = Date.now();
    }
  }

  /**
   * Stops the clock for this game, if it was previously running.
   */
  pause() {
    if (!this.isPaused) {
      this.priorElapsedMs = this.elapsedMs;
      this.resumedTimestamp = 0;
    }
  }
}
