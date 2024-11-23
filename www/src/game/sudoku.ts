import * as wasm from 'luke-doku-rust';
import {Grid, ReadonlyGrid} from './grid';
import {dateString, DateString} from './types';

/**
 * Describes a Sudoku puzzle.
 */
export class Sudoku {
  constructor(
    readonly clues: ReadonlyGrid,
    /** All the solutions to the given clues. */
    readonly solutions: readonly ReadonlyGrid[],
    /** If it's a puzzle generated by Luke-doku, its ID. */
    readonly id?: PuzzleId,
    /** If it's a puzzle imported from elsewhere, a description of where it comes from. */
    readonly source?: string,
  ) {}

  static fromWasm(puzzle: wasm.Puzzle, source?: string): Sudoku {
    return new Sudoku(
      new Grid(puzzle.clues),
      puzzle.solutions.map(s => new Grid(s)),
      PuzzleId.fromGenOpts(puzzle.gen_opts),
      source,
    );
  }
}

/**
 * Identifies a Luke-doku generated puzzle.
 */
export class PuzzleId {
  constructor(readonly date: DateString, readonly counter: number) {}

  static fromGenOpts(genOpts?: wasm.GenOpts): PuzzleId | undefined {
    return (
      genOpts &&
      new PuzzleId(dateString(genOpts.daily_solution.date), genOpts.counter)
    );
  }
}