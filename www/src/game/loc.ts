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

  private constructor(index: number) {
    this.index = index;
    this.row = Math.floor(index / 9);
    this.col = index % 9;
  }

  /**
   * The 81 locations of a Sudoku grid, in row-major order.
   */
  static readonly ALL: readonly Loc[] = iota(81).map(i => new Loc(i));

  /** Converts a location index into a Loc. */
  static of(index: number): Loc;

  /** Converts a row-column pair into a Loc. */
  static of(row: number, col: number): Loc;

  static of(rowOrIndex: number, col?: number): Loc {
    if (col === undefined) return Loc.ALL[checkIntRange(rowOrIndex, 0, 81)];
    const row = checkIntRange(rowOrIndex, 0, 9);
    const index = row * 9 + checkIntRange(col, 0, 9);
    return Loc.ALL[index];
  }
}
