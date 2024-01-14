import * as wasm from 'luke-doku-rust';

export type ReadonlyGrid = Pick<
  wasm.Grid,
  | 'brokenLocs'
  | 'get'
  | 'isComplete'
  | 'isEmpty'
  | 'len'
  | 'solvedGrid'
  | 'toFlatString'
  | 'toString'
>;
