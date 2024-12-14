/*
 * Functions to serialize and deserialize commands.
 */

import {Command, CommandTag, CompletionState, RecordedCommand} from './command';
import {
  ActivateTrail,
  ArchiveTrail,
  ClearCell,
  CopyFromTrail,
  CreateTrail,
  GuessSolutionCount,
  MarkCompleted,
  Pause,
  Redo,
  RedoToEnd,
  Resume,
  SetNum,
  SetNums,
  ToggleTrailsActive,
  ToggleTrailVisibility,
  Undo,
  UndoToStart,
} from './commands';
import {Loc} from './loc';

// We start the serialized form with the version number.
const VERSION = 0;

/**
 * Turns a list of recorded commands into a list of bytes, which can later be
 * converted back into the commands using `deserializeCommands`.
 * @param history The commands applied to a given Luke-doku game.
 */
export function serializeCommands(history: RecordedCommand[]): Int8Array {
  const array: number[] = [VERSION];
  const sink = (n: number) => writeBase128(n, array);
  let prevTimestamp = 0;
  for (const c of history) {
    const {tag} = c.command;
    const s = serializersByTag[tag];
    if (!s) {
      throw new Error(`No serializer found for command ${c.command}`);
    }
    sink(tag);
    s.serializeArgs(c.command, sink);
    const delta = c.elapsedTimestamp - prevTimestamp;
    if (delta < 0) {
      throw new Error(
        `Time going backwards not allowed, ${prevTimestamp} -> ${c.elapsedTimestamp}`,
      );
    }
    sink(delta);
    prevTimestamp = c.elapsedTimestamp;
  }
  return new Int8Array(array);
}

/**
 * Turns the serialized form of a list of recorded commands back into commands.
 * @param serialized A list of numbers previously returned by
 * `serializeCommands`.
 * @throws Error if the input is malformed
 */
export function deserializeCommands(serialized: Int8Array): RecordedCommand[] {
  const answer = [];
  let index = 0;
  const source = () => serialized[index++];
  if (source() != VERSION) {
    throw new Error(
      `Expected command serialization version ${VERSION}, got ${serialized[0]}`,
    );
  }
  let prevTimestamp = 0;
  while (index < serialized.length) {
    const tag = readBase128(source) as CommandTag;
    const s = serializersByTag[tag];
    if (!s) {
      throw new Error(`No serializer found for tag ${tag}`);
    }
    const command = new s.ctor(...s.deserializeArgs(source));
    const elapsedTimestamp = prevTimestamp + readBase128(source);
    prevTimestamp = elapsedTimestamp;
    answer.push({command, elapsedTimestamp});
  }
  return answer;
}

// Largest 32-bit int:
const UINT_MAX = -1 >>> 0;

/**
 * Writes the given non-negative integer in "base 128" to the given array.  This
 * is the protocol buffer "varint" algorithm: we write numbers larger than 127
 * in pieces, 7 bits at a time, starting from the low bits.
 */
function writeBase128(i: number, array: number[]) {
  if (i < 0) throw new Error(`Can't serialize negative numbers: ${i}`);
  while (i > UINT_MAX) {
    array.push((i & 127) | 128);
    i = Math.floor(i / 128);
  }
  do {
    let byte = i & 127;
    i >>>= 7;
    if (i > 0) {
      byte |= 128;
    }
    array.push(byte);
  } while (i);
  return;
}

/**
 * Does the opposite of `writeBase128`: reads a series of bytes and reconstructs
 * the integer that produced it.
 */
function readBase128(source: () => number): number {
  let answer = 0;
  let multiplier = 1;
  while (true) {
    const byte = source();
    answer += multiplier * (byte & 127);
    if (byte >= 0) break;
    multiplier *= 128;
  }
  return answer;
}

interface CommandCtor<T extends Command = Command> {
  new (...args: any): T;
}

interface Serializer<Ctor extends CommandCtor, TagValue extends CommandTag> {
  readonly tag: TagValue;
  readonly ctor: Ctor;
  serializeArgs(
    command: InstanceType<Ctor>,
    sink: (value: number) => void,
  ): void;
  deserializeArgs(source: () => number): ConstructorParameters<Ctor>;
}

const noSerialize = () => {};
const noDeserialize = () => [] as [x?: unknown];
const serializeTrailId = (
  command: {trailId: number},
  sink: (value: number) => void,
) => {
  sink(command.trailId);
};
const deserializeTrailId: (
  source: () => number,
) => [trailId: number] = source => [readBase128(source)];

const resume: Serializer<typeof Resume, CommandTag.RESUME> = {
  tag: CommandTag.RESUME,
  ctor: Resume,
  serializeArgs(command, sink) {
    sink(command.timestamp);
  },
  deserializeArgs(source) {
    return [readBase128(source)];
  },
};
const pause: Serializer<typeof Pause, CommandTag.PAUSE> = {
  tag: CommandTag.PAUSE,
  ctor: Pause,
  serializeArgs(command, sink) {
    sink(command.reason);
  },
  deserializeArgs(source) {
    return [readBase128(source)];
  },
};
const markCompleted: Serializer<
  typeof MarkCompleted,
  CommandTag.MARK_COMPLETED
> = {
  tag: CommandTag.MARK_COMPLETED,
  ctor: MarkCompleted,
  serializeArgs(command, sink) {
    sink(command.completionState);
  },
  deserializeArgs(source): [state: CompletionState] {
    return [readBase128(source)];
  },
};
const guessSolutionCount: Serializer<
  typeof GuessSolutionCount,
  CommandTag.GUESS_SOLUTION_COUNT
> = {
  tag: CommandTag.GUESS_SOLUTION_COUNT,
  ctor: GuessSolutionCount,
  serializeArgs(command, sink) {
    sink(command.guess);
  },
  deserializeArgs(source) {
    return [readBase128(source)];
  },
};
const clearCell: Serializer<typeof ClearCell, CommandTag.CLEAR_CELL> = {
  tag: CommandTag.CLEAR_CELL,
  ctor: ClearCell,
  serializeArgs(command, sink) {
    sink(command.loc.index);
  },
  deserializeArgs(source): [loc: Loc] {
    return [Loc.of(readBase128(source))];
  },
};
const setNum: Serializer<typeof SetNum, CommandTag.SET_NUM> = {
  tag: CommandTag.SET_NUM,
  ctor: SetNum,
  serializeArgs(command, sink) {
    sink(command.loc.index);
    sink(command.num);
  },
  deserializeArgs(source): [loc: Loc, num: number] {
    return [Loc.of(readBase128(source)), readBase128(source)];
  },
};
const setNums: Serializer<typeof SetNums, CommandTag.SET_NUMS> = {
  tag: CommandTag.SET_NUMS,
  ctor: SetNums,
  serializeArgs(command, sink) {
    sink(command.loc.index);
    sink(Number([...command.nums].map(String).join('')));
  },
  deserializeArgs(source): [loc: Loc, nums: Set<number>] {
    return [
      Loc.of(readBase128(source)),
      new Set(String(readBase128(source)).split('').map(Number)),
    ];
  },
};
const undo: Serializer<typeof Undo, CommandTag.UNDO> = {
  tag: CommandTag.UNDO,
  ctor: Undo,
  serializeArgs: noSerialize,
  deserializeArgs: noDeserialize,
};
const redo: Serializer<typeof Redo, CommandTag.REDO> = {
  tag: CommandTag.REDO,
  ctor: Redo,
  serializeArgs: noSerialize,
  deserializeArgs: noDeserialize,
};
const undoToStart: Serializer<typeof UndoToStart, CommandTag.UNDO_TO_START> = {
  tag: CommandTag.UNDO_TO_START,
  ctor: UndoToStart,
  serializeArgs: noSerialize,
  deserializeArgs: noDeserialize,
};
const redoToEnd: Serializer<typeof RedoToEnd, CommandTag.REDO_TO_END> = {
  tag: CommandTag.REDO_TO_END,
  ctor: RedoToEnd,
  serializeArgs: noSerialize,
  deserializeArgs: noDeserialize,
};
const createTrail: Serializer<typeof CreateTrail, CommandTag.CREATE_TRAIL> = {
  tag: CommandTag.CREATE_TRAIL,
  ctor: CreateTrail,
  serializeArgs: noSerialize,
  deserializeArgs: noDeserialize,
};
const activateTrail: Serializer<
  typeof ActivateTrail,
  CommandTag.ACTIVATE_TRAIL
> = {
  tag: CommandTag.ACTIVATE_TRAIL,
  ctor: ActivateTrail,
  serializeArgs: serializeTrailId,
  deserializeArgs: deserializeTrailId,
};
const toggleTrailVisibility: Serializer<
  typeof ToggleTrailVisibility,
  CommandTag.TOGGLE_TRAIL_VISIBILITY
> = {
  tag: CommandTag.TOGGLE_TRAIL_VISIBILITY,
  ctor: ToggleTrailVisibility,
  serializeArgs: serializeTrailId,
  deserializeArgs: deserializeTrailId,
};
const archiveTrail: Serializer<typeof ArchiveTrail, CommandTag.ARCHIVE_TRAIL> =
  {
    tag: CommandTag.ARCHIVE_TRAIL,
    ctor: ArchiveTrail,
    serializeArgs: serializeTrailId,
    deserializeArgs: deserializeTrailId,
  };
const toggleTrailsActive: Serializer<
  typeof ToggleTrailsActive,
  CommandTag.TOGGLE_TRAILS_ACTIVE
> = {
  tag: CommandTag.TOGGLE_TRAILS_ACTIVE,
  ctor: ToggleTrailsActive,
  serializeArgs: noSerialize,
  deserializeArgs: noDeserialize,
};
const copyFromTrail: Serializer<
  typeof CopyFromTrail,
  CommandTag.COPY_FROM_TRAIL
> = {
  tag: CommandTag.COPY_FROM_TRAIL,
  ctor: CopyFromTrail,
  serializeArgs: serializeTrailId,
  deserializeArgs: deserializeTrailId,
};

type SerializerMap = {
  [tag in CommandTag]: Serializer<any, any>;
};

const serializersByTag: SerializerMap = {
  [CommandTag.RESUME]: resume,
  [CommandTag.PAUSE]: pause,
  [CommandTag.MARK_COMPLETED]: markCompleted,
  [CommandTag.GUESS_SOLUTION_COUNT]: guessSolutionCount,
  [CommandTag.CLEAR_CELL]: clearCell,
  [CommandTag.SET_NUM]: setNum,
  [CommandTag.SET_NUMS]: setNums,
  [CommandTag.UNDO]: undo,
  [CommandTag.REDO]: redo,
  [CommandTag.UNDO_TO_START]: undoToStart,
  [CommandTag.REDO_TO_END]: redoToEnd,
  [CommandTag.CREATE_TRAIL]: createTrail,
  [CommandTag.ACTIVATE_TRAIL]: activateTrail,
  [CommandTag.TOGGLE_TRAIL_VISIBILITY]: toggleTrailVisibility,
  [CommandTag.ARCHIVE_TRAIL]: archiveTrail,
  [CommandTag.TOGGLE_TRAILS_ACTIVE]: toggleTrailsActive,
  [CommandTag.COPY_FROM_TRAIL]: copyFromTrail,
};

/** For use by the test only. */
export const TEST_ONLY = {
  serializersByTag,
};
