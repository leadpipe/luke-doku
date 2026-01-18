import {TEST_ONLY} from './puzzle-worker';
import {
  type EvaluatePuzzleMessage,
  type PuzzleGeneratedMessage,
  type PuzzleTestedMessage,
  ToWorkerMessageType,
} from './worker-types';

const {generatePuzzle, evaluatePuzzle, testPuzzle} = TEST_ONLY;

describe('Puzzle Worker', () => {
  describe('generatePuzzle', () => {
    it('generates a valid puzzle for a given date and counter', () => {
      const message = {
        type: ToWorkerMessageType.GENERATE_PUZZLE,
        date: '2024-12-07',
        counter: 1,
        interactionId: 1,
      } as const;
      const result = generatePuzzle(message) as PuzzleGeneratedMessage;

      expect(result.type).toBe('PUZZLE_GENERATED');
      expect(result.clues).toBeTruthy();
      expect(result.solutions).toHaveLength(1);
      expect(result.generatorVersion).toBeDefined();
      expect(result.elapsedMs).toBeGreaterThanOrEqual(0);
    });

    it('caches daily solutions for repeated generations', () => {
      const message1 = {
        type: ToWorkerMessageType.GENERATE_PUZZLE,
        date: '2024-12-08',
        counter: 1,
        interactionId: 1,
      } as const;
      const message2 = {
        type: ToWorkerMessageType.GENERATE_PUZZLE,
        date: '2024-12-08',
        counter: 2,
        interactionId: 2,
      } as const;

      const result1 = generatePuzzle(message1) as PuzzleGeneratedMessage;
      const result2 = generatePuzzle(message2) as PuzzleGeneratedMessage;

      expect(result1.type).toBe('PUZZLE_GENERATED');
      expect(result2.type).toBe('PUZZLE_GENERATED');
      // First generation should have dailySolutionElapsedMs, second should be absent (cached)
      expect(result1.dailySolutionElapsedMs).toBeDefined();
      expect(result2.dailySolutionElapsedMs).toBeUndefined();
    });

    it('returns different puzzles for different counters', () => {
      const message1 = {
        type: ToWorkerMessageType.GENERATE_PUZZLE,
        date: '2024-12-09',
        counter: 1,
        interactionId: 1,
      } as const;
      const message2 = {
        type: ToWorkerMessageType.GENERATE_PUZZLE,
        date: '2024-12-09',
        counter: 2,
        interactionId: 2,
      } as const;

      const result1 = generatePuzzle(message1) as PuzzleGeneratedMessage;
      const result2 = generatePuzzle(message2) as PuzzleGeneratedMessage;

      expect(result1.clues).not.toEqual(result2.clues);
    });

    it('handles invalid dates gracefully', () => {
      const message = {
        type: ToWorkerMessageType.GENERATE_PUZZLE,
        date: '2099-13-45', // invalid date
        counter: 1,
        interactionId: 1,
      } as const;

      const result = generatePuzzle(message);
      expect(result.type).toBe('ERROR_CAUGHT');
    });
  });

  describe('evaluatePuzzle', () => {
    it('evaluates a valid puzzle', () => {
      const generateMessage = {
        type: ToWorkerMessageType.GENERATE_PUZZLE,
        date: '2024-12-10',
        counter: 1,
        interactionId: 1,
      } as const;
      const generateResult = generatePuzzle(
        generateMessage,
      ) as PuzzleGeneratedMessage;

      const evaluateMessage: EvaluatePuzzleMessage = {
        type: ToWorkerMessageType.EVALUATE_PUZZLE,
        clues: generateResult.clues,
        solutions: generateResult.solutions,
        interactionId: 2,
      };

      const result = evaluatePuzzle(evaluateMessage);
      expect(result.type).toBe('PUZZLE_EVALUATED');
      expect((result as any).complexity).toBeDefined();
      expect((result as any).estimatedTimeMs).toBeGreaterThanOrEqual(0);
      expect((result as any).evaluatorVersion).toBeDefined();
    });

    it('returns error for invalid clues', () => {
      const message: EvaluatePuzzleMessage = {
        type: ToWorkerMessageType.EVALUATE_PUZZLE,
        clues: 'invalid',
        solutions: ['123456789'.repeat(9)],
        interactionId: 3,
      };

      const result = evaluatePuzzle(message);
      expect(result.type).toBe('ERROR_CAUGHT');
    });
  });

  describe('testPuzzle', () => {
    it('tests a valid puzzle', () => {
      const generateMessage = {
        type: ToWorkerMessageType.GENERATE_PUZZLE,
        date: '2024-12-11',
        counter: 1,
        interactionId: 1,
      } as const;
      const generateResult = generatePuzzle(
        generateMessage,
      ) as PuzzleGeneratedMessage;

      const testMessage = {
        type: ToWorkerMessageType.TEST_PUZZLE,
        clues: generateResult.clues,
        interactionId: 4,
      } as const;

      const result = testPuzzle(testMessage) as PuzzleTestedMessage;
      expect(result.type).toBe('PUZZLE_TESTED');
      expect(result.solutions).toBeDefined();
      expect(result.elapsedMs).toBeGreaterThanOrEqual(0);
    });

    it('tests an incomplete set of clues', () => {
      const testMessage = {
        type: ToWorkerMessageType.TEST_PUZZLE,
        clues: '.'.repeat(81), // empty grid, too many solutions
        interactionId: 4,
      } as const;

      const result = testPuzzle(testMessage) as PuzzleTestedMessage;
      expect(result.type).toBe('PUZZLE_TESTED');
      expect(result.solutions).toBeUndefined();
      expect(result.incomplete).toBe(true);
      expect(result.elapsedMs).toBeGreaterThanOrEqual(0);
    });

    it('tests an erroneous set of clues', () => {
      const testMessage = {
        type: ToWorkerMessageType.TEST_PUZZLE,
        clues:
          '53..7....6..195....98....6.8...6...34..8..6...3...17....2...6....28....419..5....',
        interactionId: 4,
      } as const;

      const result = testPuzzle(testMessage) as PuzzleTestedMessage;
      expect(result.type).toBe('PUZZLE_TESTED');
      expect(result.solutions).toBeUndefined();
      expect(result.incomplete).toBe(false);
      expect(result.elapsedMs).toBeGreaterThanOrEqual(0);
    });

    it('returns error for invalid clues', () => {
      const message = {
        type: ToWorkerMessageType.TEST_PUZZLE,
        clues: 'invalid',
        interactionId: 5,
      } as const;

      const result = testPuzzle(message);
      expect(result.type).toBe('ERROR_CAUGHT');
    });
  });
});
