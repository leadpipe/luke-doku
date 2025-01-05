import {
  Command,
  CommandTag,
  GameInternals,
  Operation,
  UndoableCommand,
} from './command';
import {Marks} from './marks';
import {Trails} from './trails';
import {UndoStack} from './undo-stack';

function cleanState<T extends {}>(stateFn: () => T): T {
  const state = {} as unknown as T;
  beforeEach(() => {
    for (const property of Object.getOwnPropertyNames(state)) {
      delete (state as {[key: string]: unknown})[property];
    }
    Object.assign(state, stateFn());
  });
  return state;
}

class FakeCommand extends Command {
  applyCount = 0;
  undoCount = 0;

  constructor(readonly partial: boolean = false) {
    super();
  }

  override apply(_internals: GameInternals): boolean {
    ++this.applyCount;
    return true;
  }

  protected override makeUndo(_internals: GameInternals): Operation {
    return {
      apply: _internals => {
        ++this.undoCount;
        return true;
      },
    };
  }

  protected override get partialUndoStep(): boolean {
    return this.partial;
  }

  override tag() {
    return CommandTag.GUESS_SOLUTIONS_COUNT; // Has to be something
  }
}

describe(`UndoStack`, () => {
  const state = cleanState(() => {
    const undoStack = new UndoStack();
    const internals: GameInternals = {
      undoStack,
      elapsedMs: 0,
      marks: new Marks(),
      trails: new Trails(),
      resume() {
        return true;
      },
      pause() {
        return true;
      },
      markCompleted(_completionState) {
        return true;
      },
      guessSolutionsCount(_guess) {
        return true;
      },
    };
    const command = new FakeCommand();
    const undoable = command.execute(internals, 0) as UndoableCommand;
    return {undoStack, internals, command, undoable};
  });

  it(`can't undo or redo before any commands are pushed`, () => {
    expect(state.undoStack.canUndo()).toBe(false);
    expect(state.undoStack.canRedo()).toBe(false);
  });

  it(`can undo but can't redo after the first push`, () => {
    state.undoStack.push(state.undoable);
    expect(state.undoStack.canUndo()).toBe(true);
    expect(state.undoStack.canRedo()).toBe(false);
  });

  it(`can't undo but can redo after the first undo`, () => {
    state.undoStack.push(state.undoable);
    const undid = state.undoStack.undo(state.internals);
    expect(undid).toBe(true);
    expect(state.undoStack.canUndo()).toBe(false);
    expect(state.undoStack.canRedo()).toBe(true);
    expect(state.command.applyCount).toBe(1);
    expect(state.command.undoCount).toBe(1);
  });

  it(`undoes all partial undo steps that preceded the last command`, () => {
    const partialCommand = new FakeCommand(true);
    const partial = partialCommand.execute(
      state.internals,
      0,
    ) as UndoableCommand;
    state.undoStack.push(state.undoable);
    state.undoStack.push(partial);
    state.undoStack.push(state.undoable);

    // when
    const undid = state.undoStack.undo(state.internals);

    // then
    expect(undid).toBe(true);
    expect(state.command.applyCount).toBe(1);
    expect(state.command.undoCount).toBe(1);
    expect(partialCommand.applyCount).toBe(1);
    expect(partialCommand.undoCount).toBe(1);
    expect(state.undoStack.undo(state.internals)).toBe(true);
    expect(state.command.undoCount).toBe(2);
    expect(state.undoStack.canUndo()).toBe(false);
  });

  it(`redoes all partial undo steps that precede the next full command`, () => {
    const partialCommand = new FakeCommand(true);
    const partial = partialCommand.execute(
      state.internals,
      0,
    ) as UndoableCommand;
    state.undoStack.push(state.undoable);
    state.undoStack.push(partial);
    state.undoStack.push(state.undoable);
    state.undoStack.undo(state.internals);
    expect(state.command.applyCount).toBe(1);
    expect(state.command.undoCount).toBe(1);
    expect(partialCommand.applyCount).toBe(1);
    expect(partialCommand.undoCount).toBe(1);

    // when
    const redid = state.undoStack.redo(state.internals);

    // then
    expect(redid).toBe(true);
    expect(state.command.applyCount).toBe(2);
    expect(partialCommand.applyCount).toBe(2);
    expect(state.undoStack.canRedo()).toBe(false);
  });
});
