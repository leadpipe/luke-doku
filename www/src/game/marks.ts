import * as wasm from 'luke-doku-rust';
import {checkIntRange} from './ints';
import {Loc} from './loc';
import {ReadonlyGrid} from './types';

/**
 * Represents a partial solution to a Sudoku in the form of the pencil marks
 * that a human might make on paper.  Each cell in the Sudoku grid is empty, or
 * has a clue, or has a non-empty subset of the 9 numerals.
 */
export class Marks {
  /**
   * An 81-element array of numbers (which are the clues), sets of numbers (the
   * pencil marks), or null (meaning a blank cell).
   */
  private cells: Array<number | ReadonlySet<number> | null>;

  /** Bootstraps a Marks from a puzzle grid. */
  constructor(puzzle: ReadonlyGrid);

  /** Clones another Marks. */
  constructor(marks: Marks);

  /** Makes an empty Marks. */
  constructor();

  constructor(marksOrPuzzle?: Marks | ReadonlyGrid) {
    if (marksOrPuzzle instanceof Marks) {
      this.cells = Array.from(marksOrPuzzle.cells);
    } else {
      const cells = Array.from<number | null>({length: 81});
      this.cells = cells;
      if (marksOrPuzzle) {
        const puzzle: ReadonlyGrid = marksOrPuzzle;
        for (let loc = 0; loc < 81; ++loc) {
          cells[loc] = puzzle.get(loc) || null;
        }
      } else {
        cells.fill(null);
      }
    }
  }

  /**
   * Clears the cell at the given location.
   *
   * @param loc Which location to clear.
   */
  clearCell(loc: Loc): void {
    this.cells[loc.index] = null;
  }

  /**
   * Returns the clue numeral at the given location, or null if the cell has
   * something other than a clue.
   *
   * @param loc Which location to check.
   * @returns The numeral clue, 1..=9, or null.
   */
  getClue(loc: Loc): number | null {
    const n = this.cells[loc.index];
    return typeof n === 'number' ? n : null;
  }

  /**
   * Sets the cell at the given location to be a numeral clue.
   *
   * @param loc Which location to set.
   * @param num The numeral clue, 1..=9.
   * @throws Error if `num` is not an integer between 1 and 9 inclusive.
   */
  setClue(loc: Loc, num: number): void {
    this.cells[loc.index] = checkIntRange(num, 1, 10);
  }

  /**
   * Returns the number marked in the given location, or null if the cell is
   * blank, has a clue, or has multiple possibilities marked in it.
   *
   * @param loc Which location to check.
   * @returns The single numeral marked in the cell, 1..=9, or null.
   */
  getNum(loc: Loc): number | null {
    const set = this.cells[loc.index];
    return set instanceof Set && set.size === 1
      ? set.values().next().value
      : null;
  }

  /**
   * Marks the cell at the given location with a single possible numeral.
   *
   * @param loc Which location to set.
   * @param num The single numeral to mark in the cell, 1..=9.
   * @throws Error if `num` is not an integer between 1 and 9 inclusive.
   */
  setNum(loc: Loc, num: number): void {
    this.cells[loc.index] = new Set([checkIntRange(num, 1, 10)]);
  }

  /**
   * Returns the set of numbers marked in the given location, or null if the
   * cell is blank or contains a clue.
   *
   * @param loc Which location to check.
   * @returns The set of numerals marked in the cell, 1..=9, or null.
   */
  getNums(loc: Loc): ReadonlySet<number> | null {
    const set = this.cells[loc.index];
    return set instanceof Set ? set : null;
  }

  /**
   * Marks the cell at the given location with a (non-empty) set of possible
   * numerals.
   *
   * @param loc Which location to set.
   * @param nums The non-empty set of numerals (1..=9) to mark in the cell.
   * @throws Error if `nums` is empty or contains anything that is not an
   *     integer between 1 and 9 inclusive.
   */
  setNums(loc: Loc, nums: ReadonlySet<number>): void {
    if (!nums.size) {
      throw new Error('Empty set not allowed, call `clearCell` instead');
    }
    this.cells[loc.index] = new Set(
      [...nums].sort().map(n => checkIntRange(n, 1, 10))
    );
  }

  /**
   * Converts this Marks to a Grid, if every cell has either a clue or a single
   * numeral marked in it.  Otherwise, returns null.
   *
   * @returns A Grid, if this Marks has a clue or single numeral marked in every
   *     location, or null otherwise.
   */
  asCompleteGrid(): wasm.Grid | null {
    if (
      this.cells.every(
        value =>
          typeof value === 'number' ||
          (value instanceof Set && value.size === 1)
      )
    ) {
      const grid = wasm.Grid.new();
      for (const loc of Loc.ALL) {
        grid.set(loc.index, this.getClue(loc) || this.getNum(loc)!);
      }
      return grid;
    }
    return null;
  }
}
