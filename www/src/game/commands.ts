import {Command, GameInternals} from './command';
import {Loc} from './loc';

export enum CommandTag {
  RESUME,
  PAUSE,
  MARK_COMPLETE,
  CLEAR_CELL,
  ASSIGN,
  UNDO,
  REDO,
  UNDO_TO_START,
  REDO_TO_END,
}

export class Resume extends Command {
  protected override apply(internals: GameInternals): boolean {
    throw new Error('Method not implemented.');
  }
}

export class Pause extends Command {
  protected override apply(internals: GameInternals): boolean {
    throw new Error('Method not implemented.');
  }
}

export class MarkComplete extends Command {
  protected override apply(internals: GameInternals): boolean {
    throw new Error('Method not implemented.');
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

  protected canApply(internals: GameInternals): boolean {
    return internals.marks.getClue(this.loc) == null;
  }
}

export class ClearCell extends Move {
  constructor(loc: Loc) {
    super(loc);
  }

  protected override apply(internals: GameInternals): boolean {
    if (this.canApply(internals)) {
      internals.marks.clearCell(this.loc);
      return true;
    }
    return false;
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

  protected override apply(internals: GameInternals): boolean {
    if (this.canApply(internals)) {
      internals.marks.setNum(this.loc, this.num);
      return true;
    }
    return false;
  }
}

export class SetNums extends Assign {
  constructor(loc: Loc, readonly nums: ReadonlySet<number>) {
    super(loc);
  }

  protected override apply(internals: GameInternals): boolean {
    if (this.canApply(internals)) {
      internals.marks.setNums(this.loc, this.nums);
      return true;
    }
    return false;
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
