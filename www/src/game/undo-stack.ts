import {GameInternals, UndoableCommand} from './command';

export class UndoStack {
  private readonly commands: UndoableCommand[] = [];
  private pointer = 0;

  push(undoable: UndoableCommand) {
    const {commands, pointer} = this;
    commands.splice(pointer); // delete everything after pointer
    // Check for the current last item being superceded by the new one
    if (pointer > 0 && undoable.command.supercedes(commands[pointer - 1].command)) {
      commands[pointer - 1] = {...undoable, undo: commands[pointer - 1].undo};
    } else {
      commands.push(undoable);
      this.pointer = commands.length; // point after the last item
    }
  }

  /**
   * Tells whether there is a command available to undo.
   */
  canUndo(): boolean {
    return this.pointer > 0;
  }

  /**
   * Tells whether there is a command available to redo, which only happens
   * after an undo has taken place.
   */
  canRedo(): boolean {
    return this.pointer < this.commands.length;
  }

  /**
   * Undoes the last command (that is, the last command that was not just
   * undone), and tells whether it worked.
   */
  undo(internals: GameInternals): boolean {
    if (!this.canUndo()) return false;
    const {commands} = this;
    while (this.pointer > 0) {
      const executedCommand = commands[--this.pointer];
      if (!internals.executeFromUndoStack(executedCommand.undo)) {
        return false;
      }
      if (!executedCommand.partialUndoStep) return true;
    }
    return true;
  }

  /**
   * Undoes the last command (that is, the last command that was not just
   * undone), and tells whether it worked.
   */
  redo(internals: GameInternals): boolean {
    if (!this.canRedo()) return false;
    const {commands} = this;
    while (this.pointer < commands.length) {
      const executedCommand = commands[this.pointer++];
      if (!internals.executeFromUndoStack(executedCommand.command)) {
        return false;
      }
      if (!executedCommand.partialUndoStep) return true;
    }
    return true;
  }
}
