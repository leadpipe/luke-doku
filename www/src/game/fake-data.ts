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
  CreateTrail,
  DuplicateTrail,
  ActivateTrail,
  ToggleTrailVisibility,
  ArchiveTrail,
  ToggleTrailsActive,
  CopyFromTrail,
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
  {command: new CreateTrail(), elapsedTimestamp: 8000},
  {command: new SetNum(Loc.of(1), 4), elapsedTimestamp: 9000},
  {command: new DuplicateTrail(0), elapsedTimestamp: 10_000},
  {command: new ActivateTrail(0), elapsedTimestamp: 11000},
  {command: new ToggleTrailVisibility(1), elapsedTimestamp: 12000},
  {command: new ArchiveTrail(1), elapsedTimestamp: 13000},
  {command: new ToggleTrailsActive(), elapsedTimestamp: 14000},
  {command: new CopyFromTrail(1), elapsedTimestamp: 15000},
  {command: new MarkComplete(CompletionState.QUIT), elapsedTimestamp: 16000},
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
  10, 1000,         // createTrail
  4, 1, 4, 1000,    // setNum
  11, 0, 1000,      // duplicateTrail
  12, 0, 1000,      // activateTrail
  13, 1, 1000,      // toggleTrailVisibility
  14, 1, 1000,      // archiveTrail
  15, 1000,         // toggleTrailsActive
  16, 1, 1000,      // copyFromTrail
  2, 1, 1000,       // markComplete (QUIT)
];
