import * as wasm from 'luke-doku-rust';
import {checkIntRange} from './ints';
import {Loc} from './loc';
import {GridString} from './types';

/**
 * A TypeScript counterpart to the Rust `wasm.Grid` struct.  Equivalent to a 9x9
 * grid of optional numerals in the range 1..=9: a Sudoku grid.
 */
export class Grid {
  // The cells of the grid are either 0, meaning blank, or 1..=9, the numeral.
  private readonly array: Uint8Array;

  /** Constructs a grid from the contents of a Rust grid. */
  constructor(grid: wasm.Grid);
  /** Constructs a grid from the contents of a Rust solved grid. */
  constructor(grid: wasm.SolvedGrid);
  /** Duplicates a grid, or constructs an empty grid if no grid is supplied. */
  constructor(grid?: ReadonlyGrid);
  /**
   * Constructs a grid from a string, such as one produced by `toString` or
   * `toFlatString`.
   */
  constructor(grid: string);

  constructor(grid?: wasm.Grid | wasm.SolvedGrid | ReadonlyGrid | string) {
    if (typeof grid === 'string') {
      grid = wasm.Grid.newFromString(grid);
    }
    this.array =
      grid instanceof wasm.Grid || grid instanceof wasm.SolvedGrid ?
        grid.bytes()
      : grid ? new Uint8Array(grid.bytes)
      : new Uint8Array(81);
  }

  /** Creates a Rust Grid from the contents of this object. */
  toWasm(): wasm.Grid {
    // Note: the fallback to .new() below should never happen in real life
    return wasm.Grid.newFromBytes(this.array) ?? wasm.Grid.new();
  }

  /**
   * Returns this grid's current numeral assignment for the given location, or
   * null.
   */
  get(loc: Loc): number | null {
    return this.array[loc.index] || null;
  }

  /**
   * Assigns the given numeral to the given location, or clears the location if
   * given null.
   */
  set(loc: Loc, num: number | null): void {
    this.array[loc.index] =
      typeof num === 'number' ? checkIntRange(num, 1, 10) : 0;
  }

  /** Returns a read-only view of the array backing the grid. */
  get bytes(): Readonly<Uint8Array> {
    return this.array;
  }

  /** Returns the number of locations with an assigned numeral. */
  getAssignedCount(): number {
    return this.bytes.reduce((count, num) => count + Number(!!num), 0);
  }

  /** Returns an ASCII-art version of this grid. */
  toString(): string {
    const grid = this.toWasm();
    try {
      return grid.toString();
    } finally {
      grid.free();
    }
  }

  /** Returns an 81-character representation of this grid, with dots for blanks. */
  toFlatString(): GridString {
    return Array.prototype.map
      .call(this.array, n => (n ? n.toString() : '.'))
      .join('') as GridString;
  }

  /**
   * Returns the set of locations that should be displayed as erroneous.  This
   * is empty when the grid is incomplete, and when the puzzle is solved.
   */
  brokenLocs(): Set<Loc> {
    const complete = this.array.every(num => num > 0);
    if (!complete) return new Set();
    const grid = this.toWasm();
    try {
      const broken = grid.brokenLocs();
      return broken ? new Set(Loc.arrayFromWasm(broken)) : new Set();
    } finally {
      grid.free();
    }
  }

  /**
   * Tells whether this grid is a valid Sudoku solution.
   */
  isSolved(): boolean {
    const grid = this.toWasm();
    try {
      return grid.isSolved();
    } finally {
      grid.free();
    }
  }
}

/** A Grid that you can't modify. */
export type ReadonlyGrid = Omit<Grid, 'set'>;
