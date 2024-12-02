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
  PauseReason,
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

const FAKE_TIMESTAMP = (-1 >>> 0) + 1; // Doesn't fit in 32 bits

export const FAKE_HISTORY: RecordedCommand[] = [
  {command: new Resume(FAKE_TIMESTAMP), elapsedTimestamp: 0},
  {command: new SetNum(Loc.of(0), 1), elapsedTimestamp: 1000},
  {command: new SetNums(Loc.of(1), new Set([4, 2, 3])), elapsedTimestamp: 2000},
  {command: new Undo(), elapsedTimestamp: 3000},
  {command: new Pause(PauseReason.AUTO), elapsedTimestamp: 3001},
  {command: new Resume(FAKE_TIMESTAMP + 10000), elapsedTimestamp: 3001},
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
export const FAKE_HISTORY_SERIALIZED: Int8Array = new Int8Array([
  0,                   // version
  0, 
    -128,-128,-128,-128,16,          // FAKE_TIMESTAMP
          0,           // resume
  5, 0, 1, -24,7,      // setNum     -- -24,7 === 1000
  6, 1, -89,3, -24,7,  // setNums    -- -89,3 === 423
  7, -24,7,            // undo
  1, 1, 1,             // pause
  0, 
    -112,-50,-128,-128,16,           // FAKE_TIMESTAMP + 10000
          0,           // resume
  8, -25,7,            // redo       -- -25,7 === 999
  9, -24,7,            // undoToStart
  10, -24,7,           // redoToEnd
  4, 0, -24,7,         // clearCell
  11, -24,7,           // createTrail
  5, 1, 4, -24,7,      // setNum
  11, -24,7,           // createTrail
  16, 0, 0,            // copyFromTrail
  12, 0, -24,7,        // activateTrail
  13, 1, -24,7,        // toggleTrailVisibility
  14, 1, -24,7,        // archiveTrail
  15, -24,7,           // toggleTrailsActive
  16, 1, -24,7,        // copyFromTrail
  2, 1, -24,7,         // markCompleted (QUIT)
  3, 2, 0,             // guessSolutionCount (2)
]);
