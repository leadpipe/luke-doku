import {Command, CompletionState, GameInternals} from './command';
import {Loc} from './loc';

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
    internals.marks.clearCell(this.loc);
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
    internals.marks.setNum(this.loc, this.num);
  }

  protected override stateAsString(): string {
    return `${this.loc}, ${this.num}`;
  }
}

export class SetNums extends Assign {
  constructor(loc: Loc, readonly nums: ReadonlySet<number>) {
    super(loc);
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
