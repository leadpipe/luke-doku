import * as wasm from 'luke-doku-rust';
import {ensureExhaustiveSwitch} from '../game/utils';
import {
  type ErrorCaughtMessage,
  type EvaluatePuzzleMessage,
  type FromWorkerMessage,
  FromWorkerMessageType,
  GeneratePuzzleMessage,
  PuzzleGeneratedMessage,
  type TestPuzzleMessage,
  ToWorkerMessage,
  ToWorkerMessageType,
} from './worker-types';

export async function handleToWorkerMessage(
  scope: DedicatedWorkerGlobalScope,
  message: ToWorkerMessage,
) {
  const messageType = message.type;
  switch (messageType) {
    case ToWorkerMessageType.GENERATE_PUZZLE:
      scope.postMessage(generatePuzzle(message));
      break;
    case ToWorkerMessageType.EVALUATE_PUZZLE:
      scope.postMessage(evaluatePuzzle(message));
      break;
    case ToWorkerMessageType.TEST_PUZZLE:
      scope.postMessage(testPuzzle(message));
      break;
    default:
      ensureExhaustiveSwitch(messageType);
  }
}

function generatePuzzle(m: GeneratePuzzleMessage): FromWorkerMessage {
  let dailySolution = dailySolutions.get(m.date);
  let startTimeMs;
  let dailySolutionElapsedMs;
  if (!dailySolution) {
    startTimeMs = performance.now();
    try {
      dailySolution = wasm.dailySolution(wasm.LogicalDate.fromString(m.date));
    } catch (e: unknown) {
      return toErrorCaught(m, 'dailySolution', e);
    }
    dailySolutionElapsedMs = performance.now() - startTimeMs;
    dailySolutions.set(m.date, dailySolution);
    while (dailySolutions.size > MAX_CACHED) {
      const date = dailySolutions.keys().next().value!;
      dailySolutions.delete(date);
    }
  }
  let puzzle;
  startTimeMs = performance.now();
  try {
    puzzle = dailySolution.generate(m.counter);
  } catch (e: unknown) {
    return toErrorCaught(m, 'dailySolution.generate', e);
  }
  const elapsedMs = performance.now() - startTimeMs;
  let symmetryMatches;
  startTimeMs = performance.now();
  try {
    symmetryMatches = wasm.bestSymmetryMatches(
      puzzle.clues,
      MAX_NONCONFORMING_LOCS,
    );
  } catch (e: unknown) {
    return toErrorCaught(m, 'bestSymmetryMatches', e);
  }
  const symMatchesElapsedMs = performance.now() - startTimeMs;
  const answer = {
    type: FromWorkerMessageType.PUZZLE_GENERATED,
    toWorkerMessage: m,
    generatorVersion: dailySolution.generator_version,
    clues: puzzle.clues.toFlatString(),
    solutions: puzzle.solutions.map((s: wasm.SolvedGrid) =>
      s.grid().toFlatString(),
    ),
    symmetryMatches,
    dailySolutionElapsedMs,
    elapsedMs,
    symMatchesElapsedMs,
  } satisfies PuzzleGeneratedMessage;
  puzzle.free();
  return answer;
}

function evaluatePuzzle(m: EvaluatePuzzleMessage): FromWorkerMessage {
  const clues = wasm.Grid.newFromString(m.clues);
  const solutions = m.solutions.map(s =>
    wasm.Grid.newFromString(s)?.solvedGrid(),
  );
  if (!clues || solutions.some(s => !s)) {
    return toErrorCaught(
      m,
      'evaluatePuzzle',
      new Error('Invalid clues or solutions'),
    );
  }
  const puzzle = wasm.Puzzle.new(clues, solutions as wasm.SolvedGrid[]);
  if (!puzzle) {
    return toErrorCaught(m, 'evaluatePuzzle', new Error('Invalid puzzle'));
  }
  let evaluatorVersion;
  let complexity;
  let estimatedTimeMs;
  const startTimeMs = performance.now();
  try {
    const rating = wasm.evaluate(puzzle);
    evaluatorVersion = rating.evaluatorVersion;
    complexity = rating.complexity;
    estimatedTimeMs = rating.estimatedTimeMs;
    rating.free();
  } catch (e: unknown) {
    return toErrorCaught(m, 'evaluatePuzzle', e);
  } finally {
    puzzle.free();
  }
  const elapsedMs = performance.now() - startTimeMs;
  return {
    type: FromWorkerMessageType.PUZZLE_EVALUATED,
    toWorkerMessage: m,
    evaluatorVersion,
    complexity,
    estimatedTimeMs,
    elapsedMs,
  };
}

function testPuzzle(m: TestPuzzleMessage): FromWorkerMessage {
  const clues = wasm.Grid.newFromString(m.clues);
  if (!clues) {
    return toErrorCaught(m, 'testPuzzle', new Error('Invalid clues'));
  }
  const startTimeMs = performance.now();
  const result = wasm.Puzzle.test(clues);
  const elapsedMs = performance.now() - startTimeMs;
  return {
    type: FromWorkerMessageType.PUZZLE_TESTED,
    toWorkerMessage: m,
    result,
    elapsedMs,
  };
}

function toErrorCaught(
  toWorkerMessage: ToWorkerMessage,
  activity: string,
  e: unknown,
): ErrorCaughtMessage {
  let answer: ErrorCaughtMessage = {
    type: FromWorkerMessageType.ERROR_CAUGHT,
    toWorkerMessage,
    activity,
  };
  if (e instanceof Error) {
    answer = {...answer, errorMessage: e.message, stack: e.stack};
  }
  return answer;
}

/**
 * The largest number of puzzle locations that don't conform to a symmetry
 * we'll still count as matching it.
 */
const MAX_NONCONFORMING_LOCS = 8;
/** The largest number of daily solutions we will keep in memory. */
const MAX_CACHED = 100;
const dailySolutions = new Map<string, wasm.DailySolution>();

export const TEST_ONLY = {
  generatePuzzle,
};
