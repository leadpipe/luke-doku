import * as wasm from 'luke-doku-rust';

export enum ToWorkerMessageType {
  GENERATE_PUZZLE = 'GENERATE_PUZZLE',
  EVALUATE_PUZZLE = 'EVALUATE_PUZZLE',
  TEST_PUZZLE = 'TEST_PUZZLE',
}

interface ToWorkerMessageBase {
  readonly interactionId: number;
  readonly type: ToWorkerMessageType;
}

export interface GeneratePuzzleMessage extends ToWorkerMessageBase {
  readonly type: ToWorkerMessageType.GENERATE_PUZZLE;

  /** The day to generate for, in DateString form. */
  readonly date: string;

  /** Which of the day's puzzles to generate. */
  readonly counter: number;
}

export interface EvaluatePuzzleMessage extends ToWorkerMessageBase {
  readonly type: ToWorkerMessageType.EVALUATE_PUZZLE;

  /** The clues of the puzzle to evaluate, in GridString form. */
  readonly clues: string;

  /** The solutions of the puzzle to evaluate, in GridString form. */
  readonly solutions: readonly string[];
}

export interface TestPuzzleMessage extends ToWorkerMessageBase {
  readonly type: ToWorkerMessageType.TEST_PUZZLE;

  /** The clues of the puzzle to test, in GridString form. */
  readonly clues: string;
}

export type ToWorkerMessage =
  | GeneratePuzzleMessage
  | EvaluatePuzzleMessage
  | TestPuzzleMessage;

export enum FromWorkerMessageType {
  ERROR_CAUGHT = 'ERROR_CAUGHT',
  PUZZLE_GENERATED = 'PUZZLE_GENERATED',
  PUZZLE_EVALUATED = 'PUZZLE_EVALUATED',
  PUZZLE_TESTED = 'PUZZLE_TESTED',
}

interface FromWorkerMessageBase {
  readonly toWorkerMessage: ToWorkerMessage;
  readonly type: FromWorkerMessageType;
}

export interface ErrorCaughtMessage extends FromWorkerMessageBase {
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

export interface PuzzleGeneratedMessage extends FromWorkerMessageBase {
  readonly toWorkerMessage: GeneratePuzzleMessage;
  readonly type: FromWorkerMessageType.PUZZLE_GENERATED;

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

export interface PuzzleEvaluatedMessage extends FromWorkerMessageBase {
  readonly toWorkerMessage: EvaluatePuzzleMessage;
  readonly type: FromWorkerMessageType.PUZZLE_EVALUATED;

  /** The version of the evaluator that produced this rating. */
  readonly evaluatorVersion: number;

  /** The complexity rating of the puzzle. */
  readonly complexity: wasm.Complexity;

  /** The estimated time to solve the puzzle, in milliseconds. */
  readonly estimatedTimeMs: number;

  /** How long it took to evaluate the puzzle, in milliseconds. */
  readonly elapsedMs: number;
}

export interface PuzzleTestedMessage extends FromWorkerMessageBase {
  readonly toWorkerMessage: TestPuzzleMessage;
  readonly type: FromWorkerMessageType.PUZZLE_TESTED;

  /** The result of the test. */
  readonly result: wasm.PuzzleProspect;

  /** How long it took to test the puzzle, in milliseconds. */
  readonly elapsedMs: number;
}

export type FromWorkerMessage =
  | ErrorCaughtMessage
  | PuzzleGeneratedMessage
  | PuzzleEvaluatedMessage
  | PuzzleTestedMessage;
