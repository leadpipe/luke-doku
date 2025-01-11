import {GameInternals, isUndoable, UndoableCommand} from './command';

export class UndoStack {
  private readonly commands: UndoableCommand[] = [];
  private next = 0;

  push(undoable: UndoableCommand): void {
    const {commands, next} = this;
    commands.splice(next); // delete everything after the previous item
    const prev = next - 1;
    // Check for the previous item being superseded by the new one.
    if (prev >= 0 && undoable.command.supersedes(commands[prev].command)) {
      commands[prev] = {...undoable, undo: commands[prev].undo};
    } else {
      commands.push(undoable);
      this.next = commands.length; // point after the last item
    }
  }

  /**
   * Tells whether there is a command available to undo.
   */
  canUndo(): boolean {
    return this.next > 0;
  }

  /**
   * Tells whether there is a command available to redo, which only happens
   * after an undo has taken place.
   */
  canRedo(): boolean {
    return this.next < this.commands.length;
  }

  /**
   * Undoes the last command (that is, the last command that was not just
   * undone), and tells whether it worked.
   */
  undo(internals: GameInternals): boolean {
    if (!this.canUndo()) return false;
    const elapsedTimestamp = 0; // Not applicable to undoing a command
    const undoableCommand = this.commands[--this.next];
    return undoableCommand.undo.apply(internals, elapsedTimestamp);
  }

  /**
   * Redoes the next undone command in the stack, and tells whether it worked.
   */
  redo(internals: GameInternals): boolean {
    if (!this.canRedo()) return false;
    const {commands} = this;
    const elapsedTimestamp = 0; // Not applicable to redoing a command
    const reExecutedCommand = commands[this.next++].command.execute(
      internals,
      elapsedTimestamp,
    );
    if (!reExecutedCommand || !isUndoable(reExecutedCommand)) {
      return false;
    }
    commands[this.next - 1] = reExecutedCommand;
    return true;
  }
}
