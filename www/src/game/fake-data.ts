import {RecordedCommand, CompletionState} from './command';
import {
  Resume,
  SetNum,
  SetNums,
  Undo,
  Pause,
  Redo,
  UndoToStart,
  RedoToEnd,
  ClearCell,
  MarkComplete,
} from './commands';
import {Loc} from './loc';

export const FAKE_HISTORY: RecordedCommand[] = [
  {command: new Resume(123), elapsedTimestamp: 0},
  {command: new SetNum(Loc.of(0), 1), elapsedTimestamp: 1000},
  {command: new SetNums(Loc.of(1), new Set([4, 2, 3])), elapsedTimestamp: 2000},
  {command: new Undo(), elapsedTimestamp: 3000},
  {command: new Pause(), elapsedTimestamp: 3001},
  {command: new Resume(10123), elapsedTimestamp: 3001},
  {command: new Redo(), elapsedTimestamp: 4000},
  {command: new UndoToStart(), elapsedTimestamp: 5000},
  {command: new RedoToEnd(), elapsedTimestamp: 6000},
  {command: new ClearCell(Loc.of(0)), elapsedTimestamp: 7000},
  {command: new MarkComplete(CompletionState.QUIT), elapsedTimestamp: 8000},
];

// prettier-ignore
export const FAKE_HISTORY_SERIALIZED: number[] = [
  0,                // version
  0, 123, 0,        // resume
  4, 0, 1, 1000,    // setNum
  5, 1, 423, 1000,  // setNums
  6, 1000,          // undo
  1, 1,             // pause
  0, 10123, 0,      // resume
  7, 999,           // redo
  8, 1000,          // undoToStart
  9, 1000,          // redoToEnd
  3, 0, 1000,       // clearCell
  2, 1, 1000,       // markComplete (QUIT)
];
