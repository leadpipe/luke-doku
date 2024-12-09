import {advanceTo} from 'jest-date-mock';
import * as wasm from 'luke-doku-rust';
import {Sudoku} from './sudoku';

describe('Sudoku', () => {
  const now = new Date(2024, 11, 7, 19, 47);
  const date = wasm.LogicalDate.fromDate(now);
  const dailySolution = wasm.dailySolution(date);
  const sudoku = Sudoku.fromWasm(dailySolution.gen(4));

  beforeEach(() => {
    advanceTo(now);
  });

  describe('toDatabaseRecord', () => {
    it('works as expected', () => {
      const record = sudoku.toDatabaseRecord();
      expect(record).toEqual({
        clues:
          '3.7....98.1..3...2.....24......173.......5.4..92.......758....1..95...7......1..4',
        solutions: [
          '327456198814739652956182437548617329731295846692348715475823961189564273263971584',
        ],
        puzzleId: '2024-12-07:4',
        attemptState: 'unstarted',
        lastUpdated: now,
        symmetryMatches: [
          {
            sym: wasm.Sym.Diagonal_Anti,
            fullOrbits: [
              new Int8Array([0, 80]),
              new Int8Array([2, 62]),
              new Int8Array([7, 17]),
              new Int8Array([8]),
              new Int8Array([10, 70]),
              new Int8Array([13, 43]),
              new Int8Array([23, 33]),
              new Int8Array([24]),
              new Int8Array([31, 41]),
              new Int8Array([32]),
              new Int8Array([46, 66]),
              new Int8Array([47, 57]),
              new Int8Array([55, 65]),
              new Int8Array([56]),
            ],
            numNonconformingLocs: 1,
            partialOrbits: [new Int8Array([27, 77])],
          },
          {
            sym: wasm.Sym.Blockwise_Anti,
            fullOrbits: [
              new Int8Array([0, 33, 57]),
              new Int8Array([7, 31, 55]),
              new Int8Array([8, 32, 56]),
              new Int8Array([17, 41, 65]),
              new Int8Array([23, 47, 80]),
            ],
            numNonconformingLocs: 8,
            partialOrbits: [
              new Int8Array([2, 35, 59]),
              new Int8Array([5, 29, 62]),
              new Int8Array([9, 42, 66]),
              new Int8Array([10, 43, 67]),
              new Int8Array([13, 37, 70]),
              new Int8Array([20, 53, 77]),
              new Int8Array([22, 46, 79]),
              new Int8Array([24, 48, 72]),
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
      expect(allBuffers).toEqual([buffers(14 + 1), buffers(5 + 8)]);
    });
  });
});
