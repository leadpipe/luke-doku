import {
  Command,
  CommandTag,
  CompletionState,
  GameInternals,
  Operation,
} from './command';
import {Loc} from './loc';
import {Marks} from './marks';
import {Trail} from './trail';
import {Trails} from './trails';

export class Resume extends Command<CommandTag.RESUME> {
  constructor(readonly timestamp: number) {
    super();
  }

  override apply(internals: GameInternals): boolean {
    return internals.resume();
  }

  override tag(): CommandTag.RESUME {
    return CommandTag.RESUME;
  }
}

/** How a game can be paused. */
export enum PauseReason {
  /** The user clicked the pause button. */
  MANUAL,
  /** The user switched away from the app. */
  AUTO,
  /**
   * The app shut down without letting us pause, and we synthesized a pause
   * from other saved state.
   */
  INFERRED,
}

export class Pause extends Command<CommandTag.PAUSE> {
  constructor(readonly reason: PauseReason) {
    super();
  }

  override apply(internals: GameInternals, elapsedTimestamp: number): boolean {
    return internals.pause(elapsedTimestamp);
  }

  override tag(): CommandTag.PAUSE {
    return CommandTag.PAUSE;
  }
}

export class MarkCompleted extends Command<CommandTag.MARK_COMPLETED> {
  constructor(readonly completionState: CompletionState) {
    super();
  }

  override apply(internals: GameInternals, elapsedTimestamp: number): boolean {
    return internals.markCompleted(this.completionState, elapsedTimestamp);
  }

  override tag(): CommandTag.MARK_COMPLETED {
    return CommandTag.MARK_COMPLETED;
  }
}

export class GuessSolutionCount extends Command<CommandTag.GUESS_SOLUTION_COUNT> {
  constructor(readonly guess: number) {
    super();
  }

  override apply(internals: GameInternals): boolean {
    return internals.guessSolutionCount(this.guess);
  }

  override tag(): CommandTag.GUESS_SOLUTION_COUNT {
    return CommandTag.GUESS_SOLUTION_COUNT;
  }
}

abstract class Move<TagValue extends CommandTag> extends Command<TagValue> {
  constructor(readonly loc: Loc) {
    super();
  }

  protected override makeUndo(internals: GameInternals): Command {
    const nums = internals.marks.getNums(this.loc);
    if (nums) return new SetNums(this.loc, nums);
    return new ClearCell(this.loc);
  }

  override apply(internals: GameInternals): boolean {
    if (internals.marks.getClue(this.loc) != null) return false;
    this.move(internals);
    return true;
  }

  protected abstract move(internals: GameInternals): void;
}

export class ClearCell extends Move<CommandTag.CLEAR_CELL> {
  constructor(loc: Loc) {
    super(loc);
  }

  protected override move(internals: GameInternals): void {
    const activeTrail = internals.trails.activeTrail;
    if (activeTrail) {
      activeTrail.set(this.loc, null);
    } else {
      internals.marks.clearCell(this.loc);
    }
  }

  protected override stateAsString(): string {
    return `${this.loc}`;
  }

  override tag(): CommandTag.CLEAR_CELL {
    return CommandTag.CLEAR_CELL;
  }
}

abstract class Assign<TagValue extends CommandTag> extends Move<TagValue> {
  override supersedes(prevCommand: Command): boolean {
    // A subsequent assignment to the same location in the grid supersedes the
    // previous one in the undo stack.
    return prevCommand instanceof Assign && prevCommand.loc === this.loc;
  }
}

export class SetNum extends Assign<CommandTag.SET_NUM> {
  constructor(
    loc: Loc,
    readonly num: number,
  ) {
    super(loc);
  }

  protected override move(internals: GameInternals): void {
    const activeTrail = internals.trails.activeTrail;
    if (activeTrail) {
      activeTrail.set(this.loc, this.num);
    } else {
      internals.marks.setNum(this.loc, this.num);
    }
  }

  protected override stateAsString(): string {
    return `${this.loc}, ${this.num}`;
  }

  override tag(): CommandTag.SET_NUM {
    return CommandTag.SET_NUM;
  }
}

export class SetNums extends Assign<CommandTag.SET_NUMS> {
  constructor(
    loc: Loc,
    readonly nums: ReadonlySet<number>,
  ) {
    super(loc);
  }

  override apply(internals: GameInternals): boolean {
    if (internals.trails.active) return false;
    return super.apply(internals);
  }

  protected override move(internals: GameInternals): void {
    internals.marks.setNums(this.loc, this.nums);
  }

  protected override stateAsString(): string {
    return `${this.loc}, {${[...this.nums].join()}}`;
  }

  override tag(): CommandTag.SET_NUMS {
    return CommandTag.SET_NUMS;
  }
}

export class Undo extends Command<CommandTag.UNDO> {
  override apply(internals: GameInternals): boolean {
    return internals.undoStack.undo(internals);
  }

  override tag(): CommandTag.UNDO {
    return CommandTag.UNDO;
  }
}

export class Redo extends Command<CommandTag.REDO> {
  override apply(internals: GameInternals): boolean {
    return internals.undoStack.redo(internals);
  }

  override tag(): CommandTag.REDO {
    return CommandTag.REDO;
  }
}

export class UndoToStart extends Command<CommandTag.UNDO_TO_START> {
  override apply(internals: GameInternals): boolean {
    while (internals.undoStack.canUndo()) {
      if (!internals.undoStack.undo(internals)) return false;
    }
    return true;
  }

  override tag(): CommandTag.UNDO_TO_START {
    return CommandTag.UNDO_TO_START;
  }
}

export class RedoToEnd extends Command<CommandTag.REDO_TO_END> {
  override apply(internals: GameInternals): boolean {
    while (internals.undoStack.canRedo()) {
      if (!internals.undoStack.redo(internals)) return false;
    }
    return true;
  }

  override tag(): CommandTag.REDO_TO_END {
    return CommandTag.REDO_TO_END;
  }
}

/**
 * The universal undo action for trail commands.
 */
class RestoreTrailsOperation implements Operation {
  readonly prevTrails: Trails;

  constructor(internals: GameInternals) {
    this.prevTrails = new Trails(internals.trails);
  }

  apply(internals: GameInternals): boolean {
    internals.trails = this.prevTrails;
    return true;
  }
}

/**
 * An undo action for commands that make multiple changes to the active trail.
 */
class RestoreActiveTrailOperation implements Operation {
  readonly prevTrail: Trail;

  constructor(internals: GameInternals) {
    const active = internals.trails.order[0];
    this.prevTrail = new Trail(active.id, active);
  }

  apply(internals: GameInternals): boolean {
    return internals.trails.replaceActiveTrail(this.prevTrail);
  }
}

/**
 * An undo action for commands that make multiple changes to marks and trails.
 */
class RestoreMarksAndTrailsOperation extends RestoreTrailsOperation {
  readonly prevMarks: Marks;

  constructor(internals: GameInternals) {
    super(internals);
    this.prevMarks = new Marks(internals.marks);
  }

  override apply(internals: GameInternals): boolean {
    super.apply(internals);
    internals.marks = this.prevMarks;
    return true;
  }
}

/**
 * The base class for all trail commands.
 */
abstract class TrailCommand<
  TagValue extends CommandTag,
> extends Command<TagValue> {
  /** Trail commands are undoable but only count as part of a single undo step. */
  protected override get partialUndoStep(): boolean {
    return true;
  }

  protected override makeUndo(internals: GameInternals): Operation {
    return new RestoreTrailsOperation(internals);
  }
}

export class CreateTrail extends TrailCommand<CommandTag.CREATE_TRAIL> {
  override apply(internals: GameInternals): boolean {
    const {trails} = internals;
    const empty = trails.order.find(t => t.isEmpty);
    if (empty) {
      // We don't create a new empty one, we just activate the existing one.
      trails.activate(empty);
    } else {
      trails.create();
    }
    return true;
  }

  override tag(): CommandTag.CREATE_TRAIL {
    return CommandTag.CREATE_TRAIL;
  }
}

abstract class TrailIdCommand<
  TagValue extends CommandTag,
> extends TrailCommand<TagValue> {
  constructor(readonly trailId: number) {
    super();
  }

  protected override stateAsString(): string {
    return String(this.trailId);
  }
}

export class ActivateTrail extends TrailIdCommand<CommandTag.ACTIVATE_TRAIL> {
  constructor(trailId: number) {
    super(trailId);
  }

  override apply(internals: GameInternals): boolean {
    const trail = internals.trails.get(this.trailId);
    return !!trail && internals.trails.activate(trail);
  }

  override tag(): CommandTag.ACTIVATE_TRAIL {
    return CommandTag.ACTIVATE_TRAIL;
  }
}

export class ToggleTrailVisibility extends TrailIdCommand<CommandTag.TOGGLE_TRAIL_VISIBILITY> {
  constructor(trailId: number) {
    super(trailId);
  }

  override apply(internals: GameInternals): boolean {
    const trail = internals.trails.get(this.trailId);
    return !!trail && internals.trails.toggleVisibility(trail);
  }

  override tag(): CommandTag.TOGGLE_TRAIL_VISIBILITY {
    return CommandTag.TOGGLE_TRAIL_VISIBILITY;
  }
}

export class ArchiveTrail extends TrailIdCommand<CommandTag.ARCHIVE_TRAIL> {
  constructor(trailId: number) {
    super(trailId);
  }

  override apply(internals: GameInternals): boolean {
    const trail = internals.trails.get(this.trailId);
    return !!trail && internals.trails.archive(trail);
  }

  override tag(): CommandTag.ARCHIVE_TRAIL {
    return CommandTag.ARCHIVE_TRAIL;
  }
}

export class ToggleTrailsActive extends TrailCommand<CommandTag.TOGGLE_TRAILS_ACTIVE> {
  override apply(internals: GameInternals): boolean {
    return internals.trails.toggleActive();
  }

  override tag(): CommandTag.TOGGLE_TRAILS_ACTIVE {
    return CommandTag.TOGGLE_TRAILS_ACTIVE;
  }
}

export class CopyFromTrail extends TrailIdCommand<CommandTag.COPY_FROM_TRAIL> {
  constructor(trailId: number) {
    super(trailId);
  }

  protected override makeUndo(internals: GameInternals): Operation {
    if (internals.trails.activeTrail?.id !== this.trailId) {
      return new RestoreActiveTrailOperation(internals);
    }
    return new RestoreMarksAndTrailsOperation(internals);
  }

  override apply(internals: GameInternals): boolean {
    const trail = internals.trails.get(this.trailId);
    if (!trail) return false;
    const {marks} = internals;
    for (const loc of Loc.ALL) {
      // This should never happen in real life
      if (trail.get(loc) && marks.getClue(loc)) return false;
    }

    let {activeTrail} = internals.trails;
    if (activeTrail === trail) {
      // Whoops, instead of copying it to itself we deactivate the trails, make
      // this trail invisible, and copy it to the solution.
      internals.trails.toggleActive();
      internals.trails.toggleVisibility(activeTrail);
      activeTrail = null;
    }

    // Start with the trailhead, so it's preserved if a trail is active.
    if (activeTrail && !activeTrail.trailhead && trail.trailhead) {
      activeTrail.set(trail.trailhead, trail.get(trail.trailhead));
    }

    for (const loc of Loc.ALL) {
      const num = trail.get(loc);
      if (num) {
        if (activeTrail) {
          activeTrail.set(loc, num);
        } else {
          marks.setNum(loc, num);
        }
      }
    }
    return true;
  }

  override tag(): CommandTag.COPY_FROM_TRAIL {
    return CommandTag.COPY_FROM_TRAIL;
  }
}
