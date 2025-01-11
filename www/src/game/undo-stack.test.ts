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
});
