import {Marks} from './marks';
import {ReadonlyGrid} from './types';

/** Manages the game state for solving a sudoku interactively. */
export class Game {
  readonly marks: Marks;

  constructor(puzzle: ReadonlyGrid) {
    this.marks = new Marks(puzzle);
  }
}
