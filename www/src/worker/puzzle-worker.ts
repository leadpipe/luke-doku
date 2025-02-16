import * as wasm from 'luke-doku-rust';
import {
  type ErrorCaughtMessage,
  type FromWorkerMessage,
  FromWorkerMessageType,
  GeneratePuzzleMessage,
  PuzzleGeneratedMessage,
  ToWorkerMessage,
  ToWorkerMessageType,
} from './worker-types';

export async function handleToWorkerMessage(
  scope: DedicatedWorkerGlobalScope,
  message: ToWorkerMessage,
) {
  switch (message.type) {
    case ToWorkerMessageType.GENERATE_PUZZLE:
      scope.postMessage(generatePuzzle(message));
      break;
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
