import {ReadonlyGrid} from './grid';

/**
 * Describes a Sudoku puzzle.
 */
export class Sudoku {
  constructor(
    readonly clues: ReadonlyGrid,
    readonly solutions: readonly ReadonlyGrid[],
  ) {}
}
