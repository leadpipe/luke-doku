import {advanceTo} from 'jest-date-mock';
import * as wasm from 'luke-doku-rust';
import {TEST_ONLY} from '../worker/puzzle-worker';
import {
  type PuzzleGeneratedMessage,
  ToWorkerMessageType,
} from '../worker/worker-types';
import {Sudoku} from './sudoku';

const {generatePuzzle} = TEST_ONLY;

describe('Sudoku', () => {
  const now = new Date(2024, 11 /*december*/, 7, 19, 47);
  const workerMessage = generatePuzzle({
    type: ToWorkerMessageType.GENERATE_PUZZLE,
    date: '2024-12-07',
    counter: 8,
    interactionId: 1,
  }) as PuzzleGeneratedMessage;
  const sudoku = Sudoku.fromWorker(workerMessage);

  beforeEach(() => {
    advanceTo(now);
  });

  describe('toDatabaseRecord', () => {
    it('works as expected', () => {
      const record = sudoku.toDatabaseRecord();
      expect(record).toEqual({
        clues:
          '..4.6........3..92.1.5......3......7.5..21.6.6......3......8.74.76.1..5.....5.8..',
        solutions: [
          '394162785567834192218579643431986527759321468682745931125698374876413259943257816',
        ],
        puzzleId: ['2024-12-07', 8, 1],
        attemptState: 'unstarted',
        lastUpdated: now,
        symmetryMatches: [
          {
            sym: wasm.Sym.Blockwise_Anti,
            fullOrbits: [
              new Int8Array([2, 35, 59]),
              new Int8Array([4, 28, 61]),
              new Int8Array([13, 37, 70]),
              new Int8Array([16, 40, 64]),
              new Int8Array([17, 41, 65]),
              new Int8Array([19, 52, 76]),
              new Int8Array([21, 45, 78]),
            ],
            numNonconformingLocs: 2,
            partialOrbits: [
              new Int8Array([5, 29, 62]),
              new Int8Array([10, 43, 67]),
            ],
          },
          {
            sym: wasm.Sym.Rotation180,
            fullOrbits: [
              new Int8Array([2, 78]),
              new Int8Array([4, 76]),
              new Int8Array([13, 67]),
              new Int8Array([16, 64]),
              new Int8Array([19, 61]),
              new Int8Array([21, 59]),
              new Int8Array([28, 52]),
              new Int8Array([35, 45]),
              new Int8Array([37, 43]),
              new Int8Array([40]),
            ],
            numNonconformingLocs: 5,
            partialOrbits: [
              new Int8Array([10, 70]),
              new Int8Array([15, 65]),
              new Int8Array([17, 63]),
              new Int8Array([18, 62]),
              new Int8Array([39, 41]),
            ],
          },
        ],
      });
    });

    it('uses a single buffer for all orbits', () => {
      const record = sudoku.toDatabaseRecord();
      const buffer = record.symmetryMatches[0].fullOrbits[0].buffer;
      const allBuffers = record.symmetryMatches.map(m =>
        m.fullOrbits
          .map(o => o.buffer)
          .concat(m.partialOrbits.map(o => o.buffer)),
      );
      const buffers = (n: number) => Array.from({length: n}).fill(buffer);
      expect(allBuffers).toEqual([buffers(7 + 2), buffers(10 + 5)]);
    });
  });

  describe('fromDatabaseRecord', () => {
    it('undoes toDatabaseRecord', () => {
      expect(Sudoku.fromDatabaseRecord(sudoku.toDatabaseRecord())).toEqual(
        sudoku,
      );
    });
  });
});
