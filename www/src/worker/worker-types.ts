import * as wasm from 'luke-doku-rust';

export enum ToWorkerMessageType {
  GENERATE_PUZZLE = 'GENERATE_PUZZLE',
}

export interface GeneratePuzzleMessage {
  readonly type: ToWorkerMessageType.GENERATE_PUZZLE;

  /** The day to generate for, in DateString form. */
  readonly date: string;

  /** Which of the day's puzzles to generate. */
  readonly counter: number;
}

export type ToWorkerMessage = GeneratePuzzleMessage;

export enum FromWorkerMessageType {
  ERROR_CAUGHT = 'ERROR_CAUGHT',
  PUZZLE_GENERATED = 'PUZZLE_GENERATED',
}

export interface ErrorCaughtMessage {
  readonly type: FromWorkerMessageType.ERROR_CAUGHT;

  /** The incoming message that this is the result for. */
  readonly toWorkerMessage: ToWorkerMessage;

  /** What the worker was doing when the error was caught. */
  readonly activity: string;

  /** If an actual Error was caught, its message. */
  readonly errorMessage?: string;

  /** If an actual Error was caught, its stack trace string. */
  readonly stack?: string;
}

/**
 * This is the interface of the symmetry match objects returned from Rust.
 */
export declare interface WasmSymMatch {
  full_orbits: number[][];
  num_nonconforming_locs: number;
  partial_orbits: number[][];
}

export interface PuzzleGeneratedMessage {
  readonly type: FromWorkerMessageType.PUZZLE_GENERATED;

  /** The incoming message that this is the result for. */
  readonly toWorkerMessage: GeneratePuzzleMessage;

  /** The version of the generator that generated this puzzle. */
  readonly generatorVersion: number;

  /** The clues in GridString form. */
  readonly clues: string;

  /** The set of solutions, each in GridString form. */
  readonly solutions: readonly string[];

  /**
   * A non-empty array of symmetries that match or partially match the layout of
   * the puzzle's clues on the grid.
   */
  readonly symmetryMatches: readonly [wasm.Sym, WasmSymMatch][];

  /**
   * How long it took the worker to generate the daily solution, in
   * milliseconds. Absent for previously cached days.
   */
  readonly dailySolutionElapsedMs?: number;

  /**
   * How long it took the worker to generate the puzzle, in milliseconds.
   */
  readonly elapsedMs: number;

  /**
   * How long it took the worker to calculate the symmetries of the puzzle's
   * clues, in milliseconds.
   */
  readonly symMatchesElapsedMs: number;
}

export type FromWorkerMessage = ErrorCaughtMessage | PuzzleGeneratedMessage;
