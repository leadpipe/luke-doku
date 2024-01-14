import {checkIntRange} from './ints';
import {iota} from './iota';

/** A TypeScript analog of our Rust Loc type. */
export class Loc {
  /** The row index, in 0..9. */
  readonly row: number;
  /** The column index, in 0..9. */
  readonly col: number;
  /** The location index, in 0..81. */
  readonly index: number;

  /** The row-col constructor. */
  constructor(row: number, col: number);
  /** The loc constructor. */
  constructor(loc: number);

  constructor(rowOrIndex: number, col?: number) {
    if (col === undefined) {
      const index = rowOrIndex;
      this.index = checkIntRange(index, 0, 81);
      this.row = Math.floor(index / 9);
      this.col = index % 9;
    } else {
      const row = rowOrIndex;
      this.row = checkIntRange(row, 0, 9);
      this.col = checkIntRange(col, 0, 9);
      this.index = row * 9 + col;
    }
  }

  /**
   * The 81 locations of a Sudoku grid, in row-major order.
   */
  static readonly ALL: readonly Loc[] = iota(81).map(i => new Loc(i));

  /** Converts a location index into a Loc. */
  static of(index: number): Loc {
    return Loc.ALL[index];
  }
}
