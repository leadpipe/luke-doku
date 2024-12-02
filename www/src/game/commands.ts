import {Command, CompletionState, GameInternals, Operation} from './command';
import {Loc} from './loc';
import {Marks} from './marks';
import {Trail} from './trail';
import {Trails} from './trails';

export class Resume extends Command {
  constructor(readonly timestamp: number) {
    super();
  }

  override apply(internals: GameInternals): boolean {
    return internals.resume();
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

export class Pause extends Command {
  constructor(readonly reason: PauseReason) {
    super();
  }

  override apply(internals: GameInternals): boolean {
    return internals.pause();
  }
}

export class MarkCompleted extends Command {
  constructor(readonly completionState: CompletionState) {
    super();
  }

  override apply(internals: GameInternals): boolean {
    return internals.markCompleted(this.completionState);
  }
}

export class GuessSolutionCount extends Command {
  constructor(readonly guess: number) {
    super();
  }

  override apply(internals: GameInternals): boolean {
    return internals.guessSolutionCount(this.guess);
  }
}

abstract class Move extends Command {
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

export class ClearCell extends Move {
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
}

abstract class Assign extends Move {
  override supersedes(prevCommand: Command): boolean {
    // A subsequent assignment to the same location in the grid supersedes the
    // previous one in the undo stack.
    return prevCommand instanceof Assign && prevCommand.loc === this.loc;
  }
}

export class SetNum extends Assign {
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
}

export class SetNums extends Assign {
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
}

export class Undo extends Command {
  override apply(internals: GameInternals): boolean {
    return internals.undoStack.undo(internals);
  }
}

export class Redo extends Command {
  override apply(internals: GameInternals): boolean {
    return internals.undoStack.redo(internals);
  }
}

export class UndoToStart extends Command {
  override apply(internals: GameInternals): boolean {
    while (internals.undoStack.canUndo()) {
      if (!internals.undoStack.undo(internals)) return false;
    }
    return true;
  }
}

export class RedoToEnd extends Command {
  override apply(internals: GameInternals): boolean {
    while (internals.undoStack.canRedo()) {
      if (!internals.undoStack.redo(internals)) return false;
    }
    return true;
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
abstract class TrailCommand extends Command {
  /** Trail commands are undoable but only count as part of a single undo step. */
  protected override get partialUndoStep(): boolean {
    return true;
  }

  protected override makeUndo(internals: GameInternals): Operation {
    return new RestoreTrailsOperation(internals);
  }
}

export class CreateTrail extends TrailCommand {
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
}

abstract class TrailIdCommand extends TrailCommand {
  constructor(readonly trailId: number) {
    super();
  }

  protected override stateAsString(): string {
    return String(this.trailId);
  }
}

export class ActivateTrail extends TrailIdCommand {
  constructor(trailId: number) {
    super(trailId);
  }

  override apply(internals: GameInternals): boolean {
    const trail = internals.trails.get(this.trailId);
    return !!trail && internals.trails.activate(trail);
  }
}

export class ToggleTrailVisibility extends TrailIdCommand {
  constructor(trailId: number) {
    super(trailId);
  }

  override apply(internals: GameInternals): boolean {
    const trail = internals.trails.get(this.trailId);
    return !!trail && internals.trails.toggleVisibility(trail);
  }
}

export class ArchiveTrail extends TrailIdCommand {
  constructor(trailId: number) {
    super(trailId);
  }

  override apply(internals: GameInternals): boolean {
    const trail = internals.trails.get(this.trailId);
    return !!trail && internals.trails.archive(trail);
  }
}

export class ToggleTrailsActive extends TrailCommand {
  override apply(internals: GameInternals): boolean {
    return internals.trails.toggleActive();
  }
}

export class CopyFromTrail extends TrailIdCommand {
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
}
