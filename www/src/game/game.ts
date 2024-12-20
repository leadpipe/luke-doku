import type {IDBPDatabase} from 'idb';
import {
  Command,
  CompletionState,
  GameInternals,
  isUndoable,
  RecordedCommand,
} from './command';
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
import {AttemptState, LukeDokuDb, PuzzleRecord} from './database';
import {Loc} from './loc';
import {Marks, ReadonlyMarks} from './marks';
import {
  deserializeCommands,
  type SerializationResult,
  serializeCommands,
} from './serialize';
import {Sudoku} from './sudoku';
import {ReadonlyTrail} from './trail';
import {ReadonlyTrails, Trails} from './trails';
import type {GridString} from './types';
import {UndoStack} from './undo-stack';
import {ensureExhaustiveSwitch} from './utils';

/** Manages the game state for solving a sudoku interactively. */
class BaseGame {
  private writableMarks: Marks;
  private readonly writableHistory: RecordedCommand[] = [];
  private readonly undoStack: UndoStack = new UndoStack();
  private writableTrails: Trails;
  private readonly internals: GameInternals;

  /** Elapsed play time in milliseconds prior to the current period. */
  private priorElapsedMs = 0;
  /** When the current period started, or 0. */
  private resumedTimestamp = 0;

  #playState = PlayState.UNSTARTED;
  #completionState?: CompletionState;
  #solutionCountGuess?: 1 | 2 | 3;

  constructor(
    readonly sudoku: Sudoku,
    history: readonly RecordedCommand[] = [],
  ) {
    this.writableMarks = new Marks(sudoku.clues);
    this.writableTrails = new Trails();
    const game = this;
    const getMarks = () => this.writableMarks;
    const setMarks = (marks: Marks) => (this.writableMarks = marks);
    const getTrails = () => this.writableTrails;
    const setTrails = (trails: Trails) => (this.writableTrails = trails);
    this.internals = {
      undoStack: this.undoStack,
      get elapsedMs(): number {
        return game.elapsedMs;
      },
      get marks(): Marks {
        return getMarks();
      },
      set marks(marks: Marks) {
        setMarks(marks);
      },
      get trails(): Trails {
        return getTrails();
      },
      set trails(trails: Trails) {
        setTrails(trails);
      },
      resume: () => {
        if (
          this.playState === PlayState.UNSTARTED ||
          this.playState === PlayState.PAUSED
        ) {
          this.resumedTimestamp = Date.now();
          this.#playState = PlayState.RUNNING;
          return true;
        }
        return false;
      },
      pause: elapsedTimestamp => {
        if (this.playState === PlayState.RUNNING) {
          this.priorElapsedMs = elapsedTimestamp;
          this.resumedTimestamp = 0;
          this.#playState = PlayState.PAUSED;
          return true;
        }
        return false;
      },
      markCompleted: (completionState, elapsedTimestamp) => {
        this.internals.pause(elapsedTimestamp);
        this.#playState = PlayState.COMPLETED;
        this.#completionState = completionState;
        this.writableTrails.hideAllTrails();
        return true;
      },
      guessSolutionCount: guess => {
        switch (guess) {
          case 1:
          case 2:
          case 3:
            this.#solutionCountGuess = guess;
            return true;
          default:
            return false;
        }
      },
    };
    // Restore historical state.
    for (const {command, elapsedTimestamp} of history) {
      const ok = this.execute(command, elapsedTimestamp);
      if (!ok) {
        throw new Error(
          `Unable to restore history: failed to execute ${command}`,
        );
      }
    }
  }

  get history(): readonly RecordedCommand[] {
    return this.writableHistory;
  }

  get marks(): ReadonlyMarks {
    return this.writableMarks;
  }

  get trails(): ReadonlyTrails {
    return this.writableTrails;
  }

  isBlank(loc: Loc): boolean {
    const {activeTrail} = this.trails;
    return activeTrail ? !activeTrail.get(loc) : !this.marks.getNums(loc);
  }

  getNum(loc: Loc): number | null {
    const {activeTrail} = this.trails;
    return activeTrail ? activeTrail.get(loc) : this.marks.getNum(loc);
  }

  getNums(loc: Loc): ReadonlySet<number> | null {
    return this.trails.active ? null : this.marks.getNums(loc);
  }

  get playState(): PlayState {
    return this.#playState;
  }

  /** Undefined before `markCompleted` is called. */
  get completionState(): CompletionState | undefined {
    return this.#completionState;
  }

  /** Undefined before `guessSolutionCount` is called. */
  get solutionCountGuess(): 1 | 2 | 3 | undefined {
    return this.#solutionCountGuess;
  }

  /**
   * Returns the total elapsed time that the game has been played so far, in
   * milliseconds.
   */
  get elapsedMs(): number {
    let answer = this.priorElapsedMs;
    if (this.resumedTimestamp !== 0) {
      answer += Date.now() - this.resumedTimestamp;
    }
    return answer;
  }

  /**
   * Resumes (or starts for the first time) the clock for this game, if it was
   * previously paused.
   */
  resume() {
    this.execute(new Resume(Date.now()));
  }

  /**
   * Stops the clock for this game, if it was previously running.
   */
  pause(reason = PauseReason.MANUAL) {
    this.execute(new Pause(reason));
  }

  /**
   * Marks this game as completed: solved or quit.
   */
  markCompleted(completionState: CompletionState) {
    this.execute(new MarkCompleted(completionState));
  }

  guessSolutionCount(guess: 1 | 2 | 3) {
    this.execute(new GuessSolutionCount(guess));
  }

  clearCell(loc: Loc): boolean {
    return this.execute(new ClearCell(loc));
  }

  setNum(loc: Loc, num: number): boolean {
    return this.execute(new SetNum(loc, num));
  }

  setNums(loc: Loc, nums: ReadonlySet<number>): boolean {
    return this.execute(new SetNums(loc, nums));
  }

  canUndo(): boolean {
    return this.undoStack.canUndo();
  }

  canRedo(): boolean {
    return this.undoStack.canRedo();
  }

  undo(): boolean {
    return this.execute(new Undo());
  }

  redo(): boolean {
    return this.execute(new Redo());
  }

  undoToStart(): boolean {
    return this.execute(new UndoToStart());
  }

  redoToEnd(): boolean {
    return this.execute(new RedoToEnd());
  }

  createTrail(): boolean {
    return this.execute(new CreateTrail());
  }

  activateTrail(trail: ReadonlyTrail): boolean {
    return this.execute(new ActivateTrail(trail.id));
  }

  toggleTrailVisibility(trail: ReadonlyTrail): boolean {
    return this.execute(new ToggleTrailVisibility(trail.id));
  }

  archiveTrail(trail: ReadonlyTrail): boolean {
    return this.execute(new ArchiveTrail(trail.id));
  }

  toggleTrailsActive(): boolean {
    return this.execute(new ToggleTrailsActive());
  }

  copyFromTrail(trail: ReadonlyTrail): boolean {
    return this.execute(new CopyFromTrail(trail.id));
  }

  protected execute(command: Command, elapsedTimestamp?: number): boolean {
    const done = command.execute(
      this.internals,
      elapsedTimestamp ?? this.elapsedMs,
    );
    if (done) {
      this.writableHistory.push(done);
      if (isUndoable(done)) {
        this.undoStack.push(done);
      }
    }
    return !!done;
  }
}

/**
 * The possible states of play of a Luke-doku puzzle.
 */
export enum PlayState {
  /**
   * The grid of numbers is invisible, and the clock is stopped at 0:00.  No
   * cells have been filled in except the clues.
   */
  UNSTARTED = 'unstarted',
  /**
   * The numbers are visible, the clock is ticking, and the cells can be filled
   * in.
   */
  RUNNING = 'running',
  /**
   * The numbers are invisible, like UNSTARTED, but the clock is stopped at some
   * (probably) non-zero time.
   */
  PAUSED = 'paused',
  /**
   * The game is over, either because the grid has been completely filled in and
   * satisfies the Sudoku conditions, or the user has given up. The clock has
   * the total time spent on the puzzle.
   */
  COMPLETED = 'completed',
}

/**
 * Manages the game state for solving a sudoku interactively.
 *
 * Extends BaseGame, which provides all the interaction points for the game, to
 * manage saving to and restoring from the database.
 */
export class Game extends BaseGame {
  /**
   * Returns the Game that corresponds to a database record, creating a new one
   * if it has not already been created or if it has been garbage collected.
   * @param db The database
   * @param record The record in the database
   */
  static forDbRecord(db: IDBPDatabase<LukeDokuDb>, record: PuzzleRecord): Game {
    let answer = this.forCluesString(record.clues);
    if (!answer) {
      answer = new Game(db, record);
      this.instances.set(record.clues, new WeakRef(answer));
    }
    return answer;
  }

  /**
   * Returns the Game that corresponds to the given clues string, if it has been
   * created and not garbage collected.
   * @param clues The clues string for the game in question
   * @returns The Game for the given clues, or undefined
   */
  static forCluesString(clues: string | GridString): Game | undefined {
    return this.instances.get(clues)?.deref();
  }

  private static readonly instances = new Map<string, WeakRef<Game>>();

  // private readonly db: IDBPDatabase<LukeDokuDb>;
  // private readonly record: PuzzleRecord;
  // Tracks the most recent DB serialization of the game history.
  private serializationResult: SerializationResult;

  /**
   * Requires a database instance and the record from the DB that corresponds to
   * this game.
   */
  private constructor(
    private readonly db: IDBPDatabase<LukeDokuDb>,
    private readonly record: PuzzleRecord,
  ) {
    const history = record.history ? deserializeCommands(record.history) : [];
    super(Sudoku.fromDatabaseRecord(record), history);
    // this.db = db;
    // this.record = record;
    this.serializationResult = {
      count: history.length,
      serialized: record.history ?? new Int8Array(),
    };
    // If the game is currently running, the app must have gotten zapped before
    // successfully writing a pause command to the database.  Insert a synthetic
    // pause using the last `elapsedMs` we were able to write.
    if (this.playState === PlayState.RUNNING) {
      this.execute(new Pause(PauseReason.INFERRED), record.elapsedMs);
    }
  }

  /**
   * Saves the current game state to the database.  Returns a promise that
   * resolves when the save is complete (or rejects when the save is aborted).
   */
  async save() {
    // Note that this call to `serializeCommands` will be a no-op when the
    // history has not grown since the last time we serialized it.
    this.serializationResult = serializeCommands(
      this.history,
      this.serializationResult,
    );
    const {record} = this;
    record.history = this.serializationResult.serialized;
    record.elapsedMs = this.elapsedMs;
    record.lastUpdated = new Date();
    record.attemptState = this.getAttemptState();
    await this.db.put('puzzles', record);
  }

  protected override execute(
    command: Command,
    elapsedTimestamp?: number,
  ): boolean {
    const answer = super.execute(command, elapsedTimestamp);
    if (answer && this.record) {
      this.save();
    }
    return answer;
  }

  private getAttemptState(): AttemptState {
    switch (this.playState) {
      case PlayState.UNSTARTED:
        return AttemptState.UNSTARTED;
      case PlayState.COMPLETED:
        return AttemptState.COMPLETED;
      case PlayState.PAUSED:
      case PlayState.RUNNING:
        return AttemptState.ONGOING;
      default:
        ensureExhaustiveSwitch(this.playState);
    }
  }
}

/** For use by tests only. */
export const TEST_ONLY = {BaseGame};
