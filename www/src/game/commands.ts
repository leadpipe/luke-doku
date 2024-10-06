import {Command, CompletionState, GameInternals} from './command';
import {Loc} from './loc';
import {Marks} from './marks';
import {ReadonlyTrail, Trail} from './trail';
import {Trails} from './trails';

export class Resume extends Command {
  constructor(readonly timestamp: number) {
    super();
  }

  protected override apply(internals: GameInternals): boolean {
    return internals.resume();
  }
}

export class Pause extends Command {
  protected override apply(internals: GameInternals): boolean {
    return internals.pause();
  }
}

export class MarkComplete extends Command {
  constructor(readonly completionState: CompletionState) {
    super();
  }

  protected override apply(internals: GameInternals): boolean {
    return internals.markComplete(this.completionState);
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

  protected override apply(internals: GameInternals): boolean {
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
  override supercedes(prevCommand: Command): boolean {
    // A subsequent assignment to the same location in the grid supercedes the
    // previous one in the undo stack.
    return prevCommand instanceof Assign && prevCommand.loc === this.loc;
  }
}

export class SetNum extends Assign {
  constructor(loc: Loc, readonly num: number) {
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
  constructor(loc: Loc, readonly nums: ReadonlySet<number>) {
    super(loc);
  }

  protected override apply(internals: GameInternals): boolean {
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
  protected override apply(internals: GameInternals): boolean {
    return internals.undoStack.undo(internals);
  }
}

export class Redo extends Command {
  protected override apply(internals: GameInternals): boolean {
    return internals.undoStack.redo(internals);
  }
}

export class UndoToStart extends Command {
  protected override apply(internals: GameInternals): boolean {
    while (internals.undoStack.canUndo()) {
      if (!internals.undoStack.undo(internals)) return false;
    }
    return true;
  }
}

export class RedoToEnd extends Command {
  protected override apply(internals: GameInternals): boolean {
    while (internals.undoStack.canRedo()) {
      if (!internals.undoStack.redo(internals)) return false;
    }
    return true;
  }
}

/**
 * The universal undo action for trail commands.
 */
class RestoreTrailsCommand extends Command {
  readonly prevTrails: Trails;

  constructor(internals: GameInternals) {
    super();
    this.prevTrails = new Trails(internals.trails);
  }

  protected override apply(internals: GameInternals): boolean {
    internals.trails = new Trails(this.prevTrails);
    return true;
  }
}

/**
 * An undo action for commands that make multiple changes to the active trail.
 */
class RestoreActiveTrailCommand extends Command {
  readonly prevTrail: Trail;

  constructor(internals: GameInternals) {
    super();
    const active = internals.trails.order[0];
    this.prevTrail = new Trail(active.id, active);
  }

  protected override apply(internals: GameInternals): boolean {
    return internals.trails.replaceActiveTrail(
      new Trail(this.prevTrail.id, this.prevTrail),
    );
  }
}

/**
 * An undo action for commands that make multiple changes to marks.
 */
class RestoreMarksCommand extends Command {
  readonly prevMarks: Marks;

  constructor(internals: GameInternals) {
    super();
    this.prevMarks = new Marks(internals.marks);
  }

  protected override apply(internals: GameInternals): boolean {
    internals.marks = new Marks(this.prevMarks);
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

  protected override makeUndo(internals: GameInternals): Command {
    return new RestoreTrailsCommand(internals);
  }
}

export class CreateTrail extends TrailCommand {
  protected override apply(internals: GameInternals): boolean {
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

export class ActivateTrail extends TrailCommand {
  constructor(readonly trailId: number) {
    super();
  }

  protected override apply(internals: GameInternals): boolean {
    const trail = internals.trails.get(this.trailId);
    return !!trail && internals.trails.activate(trail);
  }
}

export class ToggleTrailVisibility extends TrailCommand {
  constructor(readonly trailId: number) {
    super();
  }

  protected override apply(internals: GameInternals): boolean {
    const trail = internals.trails.get(this.trailId);
    return !!trail && internals.trails.toggleVisibility(trail);
  }
}

export class ArchiveTrail extends TrailCommand {
  constructor(readonly trailId: number) {
    super();
  }

  protected override apply(internals: GameInternals): boolean {
    const trail = internals.trails.get(this.trailId);
    return !!trail && internals.trails.archive(trail);
  }
}

export class ToggleTrailsActive extends TrailCommand {
  protected override apply(internals: GameInternals): boolean {
    return internals.trails.toggleActive();
  }
}

export class CopyFromTrail extends Command {
  constructor(readonly trailId: number) {
    super();
  }

  protected override makeUndo(internals: GameInternals): Command {
    if (internals.trails.active) {
      return new RestoreActiveTrailCommand(internals);
    }
    return new RestoreMarksCommand(internals);
  }

  protected override apply(internals: GameInternals): boolean {
    const trail = internals.trails.get(this.trailId);
    if (!trail) return false;
    const {marks} = internals;
    for (const loc of Loc.ALL) {
      // This should never happen in real life
      if (trail.get(loc) && marks.getClue(loc)) return false;
    }
    
    const {activeTrail} = internals.trails;
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
