import {Marks} from './marks';
import {Trails} from './trails';
import {UndoStack} from './undo-stack';

/**
 * Describes a transformation that can be applied to a Luke-doku game.
 */
export interface Operation {
  /**
   * Applies this operation to the given game.
   */
  apply(internals: GameInternals): boolean;
}

/**
 * Describes an action that the user can take on a Luke-doku game.
 */
export abstract class Command extends Object implements Operation {
  /**
   * Attempts to apply this command to the given game, and returns a record of
   * what happened, or returns null if the command could not be executed.
   */
  execute(
    internals: GameInternals,
    elapsedTimestamp: number,
  ): ExecutedCommand | null {
    const undo = this.makeUndo(internals);
    if (this.apply(internals)) {
      return {
        command: this,
        elapsedTimestamp,
        undo,
        partialUndoStep: this.partialUndoStep,
      };
    }
    return null;
  }

  /**
   * Tells whether this command should replace the given previous command on the
   * undo stack.  Defaults to false.
   */
  supercedes(_prevCommand: Command): boolean {
    return false;
  }

  /**
   * Overrides Object's toString by showing the name of the command and any
   * relevant state.
   */
  override toString(): string {
    return `${this.constructor.name}(${this.stateAsString()})`;
  }

  /**
   * Constructs an operation that will undo this command, or returns null if
   * this command should not be put on the undo stack.  The default
   * implementation returns null.
   */
  protected makeUndo(_internals: GameInternals): Operation | null {
    return null;
  }

  /**
   * Actually applies this command to the given game, telling whether it was
   * able to do so.
   */
  abstract apply(internals: GameInternals): boolean;

  /**
   * Whether this command should be considered a partial undo step; defaults to
   * false.
   */
  protected get partialUndoStep(): boolean {
    return false;
  }

  /** Commands with state should override this to return it in string form. */
  protected stateAsString(): string {
    return '';
  }
}

/**
 * Records an action taken on a Luke-doku game.
 */
export interface RecordedCommand {
  /** The command that was executed. */
  readonly command: Command;

  /** How many milliseconds into the game this happened. */
  readonly elapsedTimestamp: number;
}

/**
 * The result of an action taken on a Luke-doku game.
 */
export interface ExecutedCommand extends RecordedCommand {
  /**
   * When `command` should be included in the undo stack, the operation that
   * will undo it.
   */
  readonly undo: Operation | null;

  /**
   * True when undoing (or redoing) this command should be combined with the
   * preceding (or following) non-partial command.  For example, enabling a
   * trail is a partial step because undoing it should also undo the cell
   * assignment that preceded enabling that trail.
   */
  readonly partialUndoStep: boolean;
}

/**
 * A subset of executed commands can be undone.
 */
export interface UndoableCommand extends ExecutedCommand {
  readonly undo: Operation;
}

/**
 * Converts an executed command into an undoable one (for the TS compiler).
 */
export function isUndoable(
  command: ExecutedCommand,
): command is UndoableCommand {
  return command.undo != null;
}

/**
 * The possible ways of completing a Luke-doku puzzle.
 */
export enum CompletionState {
  /** You solved the puzzle. */
  SOLVED,
  /** You quit before you'd solved it. */
  QUIT,
}

/**
 * Exposes the internals of a Game object for commands to manipulate.
 */
export interface GameInternals {
  readonly undoStack: UndoStack;
  readonly elapsedMs: number;
  marks: Marks;
  trails: Trails;
  resume(): boolean;
  pause(): boolean;
  markCompleted(completionState: CompletionState): boolean;
  guessSolutionCount(guess: number): boolean;
}
