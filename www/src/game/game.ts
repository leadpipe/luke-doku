import {ReadonlyGrid} from './grid';
import {Marks} from './marks';

export enum GameState {
  UNSTARTED,
  RUNNING,
  PAUSED,
  SOLVED,
}

/** Manages the game state for solving a sudoku interactively. */
export class Game {
  readonly marks: Marks;

  /** Elapsed play time in milliseconds prior to the current period. */
  private priorElapsedMs = 0;
  /** When the current period started, or 0. */
  private resumedTimestamp = 0;

  private gameState = GameState.UNSTARTED;

  constructor(readonly puzzle: ReadonlyGrid) {
    this.marks = new Marks(puzzle);
  }

  get state(): GameState {
    return this.gameState;
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
  markSolved() {
    this.pause();
    this.gameState = GameState.SOLVED;
  }
}
