import type {ErroneousAssignmentProductivity} from '../facts/ErroneousAssignmentProductivity';
import type {Fact} from '../facts/Fact';
import * as wasm from '../wasm';

export enum ToWorkerMessageType {
  GENERATE_PUZZLE = 'GENERATE_PUZZLE',
  EVALUATE_PUZZLE = 'EVALUATE_PUZZLE',
  TEST_PUZZLE = 'TEST_PUZZLE',
  FIND_SYMMETRIES = 'FIND_SYMMETRIES',
  DEDUCE_FACTS = 'DEDUCE_FACTS',
  CALCULATE_ERRONEOUS_PRODUCTIVITY = 'CALCULATE_ERRONEOUS_PRODUCTIVITY',
  DISPROVE_ERRONEOUS_ASSIGNMENT = 'DISPROVE_ERRONEOUS_ASSIGNMENT',
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

export interface FindSymmetriesMessage extends ToWorkerMessageBase {
  readonly type: ToWorkerMessageType.FIND_SYMMETRIES;

  /** The clues of the puzzle for which to find symmetries, in GridString form. */
  readonly clues: string;
}

export type EliminationConstraint = {loc: number; num: number}[];

export interface DeduceFactsMessage extends ToWorkerMessageBase {
  readonly type: ToWorkerMessageType.DEDUCE_FACTS;

  /** The clues of the puzzle for which to deduce facts, in GridString form. */
  readonly grid: string;

  /** The maximum amount of time to spend deducing facts, in milliseconds. */
  readonly maxTimeMs: number;

  /** Applied disproof constraints. */
  readonly eliminations?: readonly EliminationConstraint[];
}


export interface CalculateErroneousProductivityMessage extends ToWorkerMessageBase {
  readonly type: ToWorkerMessageType.CALCULATE_ERRONEOUS_PRODUCTIVITY;
  readonly grid: string;
  readonly solutions?: readonly string[];
}

export interface DisproveErroneousAssignmentMessage extends ToWorkerMessageBase {
  readonly type: ToWorkerMessageType.DISPROVE_ERRONEOUS_ASSIGNMENT;
  readonly grid: string;
  readonly target: {loc: number; num: number};
  readonly solutions?: readonly string[];
  readonly eliminations?: readonly EliminationConstraint[];
  readonly maxTimeMs?: number;
}

export type ToWorkerMessage =
  | GeneratePuzzleMessage
  | EvaluatePuzzleMessage
  | TestPuzzleMessage
  | FindSymmetriesMessage
  | DeduceFactsMessage
  | CalculateErroneousProductivityMessage
  | DisproveErroneousAssignmentMessage;

export enum FromWorkerMessageType {
  ERROR_CAUGHT = 'ERROR_CAUGHT',
  PUZZLE_GENERATED = 'PUZZLE_GENERATED',
  PUZZLE_EVALUATED = 'PUZZLE_EVALUATED',
  PUZZLE_TESTED = 'PUZZLE_TESTED',
  SYMMETRIES_FOUND = 'SYMMETRIES_FOUND',
  FACTS_DEDUCED = 'FACTS_DEDUCED',
  ERRONEOUS_PRODUCTIVITY_CALCULATED = 'ERRONEOUS_PRODUCTIVITY_CALCULATED',
  ERRONEOUS_ASSIGNMENT_DISPROVED = 'ERRONEOUS_ASSIGNMENT_DISPROVED',
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
   * How long it took the worker to generate the daily solution, in
   * milliseconds. Absent for previously cached days.
   */
  readonly dailySolutionElapsedMs?: number;

  /**
   * How long it took the worker to generate the puzzle, in milliseconds.
   */
  readonly elapsedMs: number;

  /** The symmetries of the puzzle's clues. */
  readonly symmetriesFound: SymmetriesFoundMessage;
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

  /** The set of solutions, each in GridString form, if the puzzle is viable. */
  readonly solutions?: readonly string[];

  /**
   * Whether the given clues are incomplete, meaning they are consistent with
   * too many solutions; only pertains when `solutions` is absent.  When
   * `solutions` is absent and this is false, the clues are erroneous: they
   * produce no solutions at all.
   */
  readonly incomplete: boolean;

  /** How long it took to test the puzzle, in milliseconds. */
  readonly elapsedMs: number;
}

export interface SymmetriesFoundMessage extends FromWorkerMessageBase {
  readonly toWorkerMessage: FindSymmetriesMessage | GeneratePuzzleMessage;
  readonly type: FromWorkerMessageType.SYMMETRIES_FOUND;

  /**
   * A non-empty array of symmetries that match or partially match the layout of
   * the puzzle's clues on the grid.
   */
  readonly symmetryMatches: readonly [wasm.Sym, WasmSymMatch][];

  /**
   * How long it took the worker to calculate the symmetries of the puzzle's
   * clues, in milliseconds.
   */
  readonly elapsedMs: number;
}

export interface FactsDeducedMessage extends FromWorkerMessageBase {
  readonly toWorkerMessage: DeduceFactsMessage;
  readonly type: FromWorkerMessageType.FACTS_DEDUCED;

  /** The facts deduced from the grid. */
  readonly facts: readonly Fact[];

  /** True if the deduction timed out before finding all facts. */
  readonly timedOut: boolean;

  /** How long it took to deduce facts, in milliseconds. */
  readonly elapsedMs: number;
}


export interface ErroneousProductivityCalculatedMessage extends FromWorkerMessageBase {
  readonly type: FromWorkerMessageType.ERRONEOUS_PRODUCTIVITY_CALCULATED;
  readonly toWorkerMessage: CalculateErroneousProductivityMessage;
  readonly results: readonly ErroneousAssignmentProductivity[];
  readonly elapsedMs: number;
}

export interface ErroneousAssignmentDisprovedMessage extends FromWorkerMessageBase {
  readonly type: FromWorkerMessageType.ERRONEOUS_ASSIGNMENT_DISPROVED;
  readonly toWorkerMessage: DisproveErroneousAssignmentMessage;
  readonly disproof?: Fact;
  readonly elapsedMs: number;
}

export type FromWorkerMessage =
  | ErrorCaughtMessage
  | PuzzleGeneratedMessage
  | PuzzleEvaluatedMessage
  | PuzzleTestedMessage
  | SymmetriesFoundMessage
  | FactsDeducedMessage
  | ErroneousProductivityCalculatedMessage
  | ErroneousAssignmentDisprovedMessage;
