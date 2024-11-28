import {CompletionState, RecordedCommand} from './command';
import {
  ActivateTrail,
  ArchiveTrail,
  ClearCell,
  CopyFromTrail,
  CreateTrail,
  GuessSolutionCount,
  MarkCompleted,
  Pause,
  Redo,
  RedoToEnd,
  Resume,
  SetNum,
  SetNums,
  ToggleTrailsActive,
  ToggleTrailVisibility,
  Undo,
  UndoToStart,
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
  {command: new CreateTrail(), elapsedTimestamp: 10_000},
  {command: new CopyFromTrail(0), elapsedTimestamp: 10_000},
  {command: new ActivateTrail(0), elapsedTimestamp: 11000},
  {command: new ToggleTrailVisibility(1), elapsedTimestamp: 12000},
  {command: new ArchiveTrail(1), elapsedTimestamp: 13000},
  {command: new ToggleTrailsActive(), elapsedTimestamp: 14000},
  {command: new CopyFromTrail(1), elapsedTimestamp: 15000},
  {command: new MarkCompleted(CompletionState.QUIT), elapsedTimestamp: 16000},
  {command: new GuessSolutionCount(2), elapsedTimestamp: 16000},
];

// prettier-ignore
export const FAKE_HISTORY_SERIALIZED: number[] = [
  0,                // version
  0, 123, 0,        // resume
  5, 0, 1, 1000,    // setNum
  6, 1, 423, 1000,  // setNums
  7, 1000,          // undo
  1, 1,             // pause
  0, 10123, 0,      // resume
  8, 999,           // redo
  9, 1000,          // undoToStart
  10, 1000,         // redoToEnd
  4, 0, 1000,       // clearCell
  11, 1000,         // createTrail
  5, 1, 4, 1000,    // setNum
  11, 1000,         // createTrail
  16, 0, 0,         // copyFromTrail
  12, 0, 1000,      // activateTrail
  13, 1, 1000,      // toggleTrailVisibility
  14, 1, 1000,      // archiveTrail
  15, 1000,         // toggleTrailsActive
  16, 1, 1000,      // copyFromTrail
  2, 1, 1000,       // markCompleted (QUIT)
  3, 2, 0,          // guessSolutionCount (2)
];
