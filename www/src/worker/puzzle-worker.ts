import {ensureExhaustiveSwitch} from '../game/utils';
import * as wasm from '../wasm';
import {
  type DeduceFactsMessage,
  type ErrorCaughtMessage,
  type EvaluatePuzzleMessage,
  type FindSymmetriesMessage,
  type FromWorkerMessage,
  FromWorkerMessageType,
  GeneratePuzzleMessage,
  PuzzleGeneratedMessage,
  type TestPuzzleMessage,
  ToWorkerMessage,
  ToWorkerMessageType,
  type CalculateErroneousProductivityMessage,
  type DisproveErroneousAssignmentMessage,
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
    case ToWorkerMessageType.FIND_SYMMETRIES:
      scope.postMessage(
        findSymmetries(wasm.Grid.newFromString(message.clues), message),
      );
      break;
    case ToWorkerMessageType.DEDUCE_FACTS:
      scope.postMessage(deduceFacts(message));
      break;
    case ToWorkerMessageType.CALCULATE_ERRONEOUS_PRODUCTIVITY:
      scope.postMessage(calculateErroneousProductivity(message));
      break;
    case ToWorkerMessageType.DISPROVE_ERRONEOUS_ASSIGNMENT:
      scope.postMessage(disproveErroneousAssignment(message));
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
  const symmetriesFound = findSymmetries(puzzle.clues, m);
  if (symmetriesFound.type !== FromWorkerMessageType.SYMMETRIES_FOUND) {
    puzzle.free();
    return symmetriesFound;
  }
  const answer = {
    type: FromWorkerMessageType.PUZZLE_GENERATED,
    toWorkerMessage: m,
    generatorVersion: dailySolution.generator_version,
    clues: puzzle.clues.toFlatString(),
    solutions: puzzle.solutions.map((s: wasm.SolvedGrid) =>
      s.grid().toFlatString(),
    ),
    symmetriesFound,
    dailySolutionElapsedMs,
    elapsedMs,
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
    solutions: result.puzzle?.solutions.map((s: wasm.SolvedGrid) =>
      s.grid().toFlatString(),
    ),
    incomplete: result.incomplete,
    elapsedMs,
  };
}

function findSymmetries(
  clues: wasm.Grid | undefined,
  m: FindSymmetriesMessage | GeneratePuzzleMessage,
): FromWorkerMessage {
  if (!clues) {
    return toErrorCaught(m, 'findSymmetries', new Error('Invalid clues'));
  }
  const startTimeMs = performance.now();
  let symmetryMatches;
  try {
    symmetryMatches = wasm.bestSymmetryMatches(clues, MAX_NONCONFORMING_LOCS);
  } catch (e: unknown) {
    return toErrorCaught(m, 'bestSymmetryMatches', e);
  } finally {
    clues.free();
  }
  const elapsedMs = performance.now() - startTimeMs;
  return {
    type: FromWorkerMessageType.SYMMETRIES_FOUND,
    toWorkerMessage: m,
    symmetryMatches,
    elapsedMs,
  };
}

function deduceFacts(m: DeduceFactsMessage): FromWorkerMessage {
  const grid = wasm.Grid.newFromString(m.grid);
  if (!grid) {
    return toErrorCaught(m, 'deduceFacts', new Error('Invalid grid'));
  }
  const startTimeMs = performance.now();
  let facts: any[] = [];
  let timedOut = false;
  try {
    const result = wasm.deduceFacts(grid, m.eliminations, m.maxTimeMs);
    facts = result?.facts || [];
    timedOut = result?.timedOut || false;
  } catch (e: unknown) {
    return toErrorCaught(m, 'deduceFacts', e);
  } finally {
    grid.free();
  }
  const elapsedMs = performance.now() - startTimeMs;
  return {
    type: FromWorkerMessageType.FACTS_DEDUCED,
    toWorkerMessage: m,
    facts,
    timedOut,
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


function calculateErroneousProductivity(
  m: CalculateErroneousProductivityMessage,
): FromWorkerMessage {
  const grid = wasm.Grid.newFromString(m.grid);
  if (!grid) {
    return toErrorCaught(m, 'calculateErroneousProductivity', new Error('Invalid grid'));
  }
  let solutions: wasm.SolvedGrid[] | undefined;
  const startTimeMs = performance.now();
  try {
    if (m.solutions) {
      solutions = [];
      for (const s of m.solutions) {
        const sg = wasm.Grid.newFromString(s)?.solvedGrid();
        if (sg) {
          solutions.push(sg);
        }
      }
    }
    const results = wasm.calculateErroneousProductivity(grid, solutions);
    solutions = undefined;

    const elapsedMs = performance.now() - startTimeMs;
    return {
      type: FromWorkerMessageType.ERRONEOUS_PRODUCTIVITY_CALCULATED,
      toWorkerMessage: m,
      results,
      elapsedMs,
    };
  } catch (e: unknown) {
    return toErrorCaught(m, 'calculateErroneousProductivity', e);
  } finally {
    grid.free();
    if (solutions) {
      for (const sg of solutions) {
        sg.free();
      }
    }
  }
}

function disproveErroneousAssignment(
  m: DisproveErroneousAssignmentMessage,
): FromWorkerMessage {
  const grid = wasm.Grid.newFromString(m.grid);
  if (!grid) {
    return toErrorCaught(m, 'disproveErroneousAssignment', new Error('Invalid grid'));
  }
  let solutions: wasm.SolvedGrid[] | undefined;
  const startTimeMs = performance.now();
  try {
    if (m.solutions) {
      solutions = [];
      for (const s of m.solutions) {
        const sg = wasm.Grid.newFromString(s)?.solvedGrid();
        if (sg) {
          solutions.push(sg);
        }
      }
    }
    const disproof = wasm.disproveErroneousAssignment(
      grid,
      m.target,
      solutions,
      m.eliminations,
      m.maxTimeMs,
    );
    solutions = undefined;

    const elapsedMs = performance.now() - startTimeMs;
    return {
      type: FromWorkerMessageType.ERRONEOUS_ASSIGNMENT_DISPROVED,
      toWorkerMessage: m,
      disproof,
      elapsedMs,
    };
  } catch (e: unknown) {
    return toErrorCaught(m, 'disproveErroneousAssignment', e);
  } finally {
    grid.free();
    if (solutions) {
      for (const sg of solutions) {
        sg.free();
      }
    }
  }
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
  evaluatePuzzle,
  testPuzzle,
  calculateErroneousProductivity,
  disproveErroneousAssignment,
};
