import * as wasm from 'luke-doku-rust';
import {checkIntRange} from './ints';
import {Loc} from './loc';

/**
 * A TypeScript counterpart to the Rust `wasm.Grid` struct.  Equivalent to a 9x9
 * grid of optional numerals in the range 1..=9: a Sudoku grid.
 */
export class Grid {
  // The cells of the grid are either 0, meaning blank, or 1..=9, the numeral.
  private readonly array: Uint8Array;

  /** Constructs an empty grid. */
  constructor();
  /** Constructs a grid from the contents of a Rust grid. */
  constructor(grid: wasm.Grid);
  /** Duplicates a grid. */
  constructor(grid: ReadonlyGrid);

  constructor(grid?: wasm.Grid | ReadonlyGrid) {
    this.array =
      grid instanceof wasm.Grid
        ? grid.bytes()
        : grid
        ? new Uint8Array(grid.bytes)
        : new Uint8Array(81);
  }

  /** Creates a Rust Grid from the contents of this object. */
  private toWasm(): wasm.Grid {
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
  toFlatString(): string {
    const grid = this.toWasm();
    try {
      return grid.toFlatString();
    } finally {
      grid.free();
    }
  }

  /**
   * Returns the state of this grid: true means it's a complete and valid
   * solution grid, false means it isn't complete, and a non-empty set of
   * locations means that every location has a numeral but the given locations
   * have errors.
   */
  state(): boolean | Set<Loc> {
    const complete = this.array.every(num => num > 0);
    if (!complete) return false;
    const grid = this.toWasm();
    try {
      const broken = grid.brokenLocs();
      if (!broken) return true;
      const locs = Array.prototype.map.apply(broken, [
        index => Loc.of(index),
      ]) as Loc[];
      return new Set(locs);
    } finally {
      grid.free();
    }
  }

  /** Returns an array of symmetry matches for this grid. */
  bestSymmetryMatches(
    maxNonconformingLocs: number,
  ): Array<[wasm.Sym, SymMatch]> {
    const grid = this.toWasm();
    try {
      return wasm
        .bestSymmetryMatches(grid, maxNonconformingLocs)
        .map(([sym, match]: [wasm.Sym, WasmSymMatch]) => {
          return [
            sym,
            {
              fullOrbits: match.full_orbits.map(orbitToLocs),
              numNonconformingLocs: match.num_nonconforming_locs,
              partialOrbits: match.partial_orbits.map(orbitToLocs),
            },
          ];
        });
    } finally {
      grid.free();
    }
  }
}

/** A Grid that you can't modify. */
export type ReadonlyGrid = Omit<Grid, 'set'>;

/**
 * The wasm code matches the possible symmetries of the Sudoku board against the
 * clues of a given puzzle to produce one or more of these objects.
 */
export declare interface SymMatch {
  fullOrbits: Loc[][];
  numNonconformingLocs: number;
  partialOrbits: Loc[][];
}

/**
 * This is the interface of the match objects returned from Rust.
 */
declare interface WasmSymMatch {
  full_orbits: number[][];
  num_nonconforming_locs: number;
  partial_orbits: number[][];
}

function orbitToLocs(orbit: number[]): Loc[] {
  return orbit.map(loc => Loc.of(loc));
}
