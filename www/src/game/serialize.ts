/*
 * Functions to serialize and deserialize commands.
 */

import {Command, CompletionState, RecordedCommand} from './command';
import {
  ActivateTrail,
  ArchiveTrail,
  ClearCell,
  CopyFromTrail,
  CreateTrail,
  MarkComplete,
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
 * Turns a list of recorded commands into a list of numbers, which can later be
 * converted back into the commands using `deserializeCommands`.
 * @param history The commands applied to a given Luke-doku game.
 */
export function serializeCommands(history: RecordedCommand[]): number[] {
  const answer = [VERSION];
  const sink = (n: number) => answer.push(n);
  let prevTimestamp = 0;
  for (const c of history) {
    const s = serializersByCtor.get(c.command.constructor);
    if (!s) {
      throw new Error(`No serializer found for command ${c.command}`);
    }
    sink(s.tag);
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
  return answer;
}

/**
 * Turns the serialized form of a list of recorded commands back into commands.
 * @param serialized A list of numbers previously returned by
 * `serializeCommands`.
 * @throws Error if the input is malformed
 */
export function deserializeCommands(serialized: number[]): RecordedCommand[] {
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
    const tag = source();
    const s = serializersByTag[tag];
    if (!s) {
      throw new Error(`No serializer found for tag ${tag}`);
    }
    const command = new s.ctor(...s.deserializeArgs(source));
    const elapsedTimestamp = prevTimestamp + source();
    prevTimestamp = elapsedTimestamp;
    answer.push({command, elapsedTimestamp});
  }
  return answer;
}

interface CommandCtor<T extends Command = Command> {
  new (...args: any): T;
}

interface Serializer<Ctor extends CommandCtor> {
  readonly tag: number;
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
) => [trailId: number] = source => [source()];

const resume: Serializer<typeof Resume> = {
  tag: 0,
  ctor: Resume,
  serializeArgs(command, sink) {
    sink(command.timestamp);
  },
  deserializeArgs(source) {
    return [source()];
  },
};
const pause: Serializer<typeof Pause> = {
  tag: 1,
  ctor: Pause,
  serializeArgs: noSerialize,
  deserializeArgs: noDeserialize,
};
const markComplete: Serializer<typeof MarkComplete> = {
  tag: 2,
  ctor: MarkComplete,
  serializeArgs(command, sink) {
    sink(command.completionState);
  },
  deserializeArgs(source): [state: CompletionState] {
    return [source()];
  },
};
const clearCell: Serializer<typeof ClearCell> = {
  tag: 3,
  ctor: ClearCell,
  serializeArgs(command, sink) {
    sink(command.loc.index);
  },
  deserializeArgs(source): [loc: Loc] {
    return [Loc.of(source())];
  },
};
const setNum: Serializer<typeof SetNum> = {
  tag: 4,
  ctor: SetNum,
  serializeArgs(command, sink) {
    sink(command.loc.index);
    sink(command.num);
  },
  deserializeArgs(source): [loc: Loc, num: number] {
    return [Loc.of(source()), source()];
  },
};
const setNums: Serializer<typeof SetNums> = {
  tag: 5,
  ctor: SetNums,
  serializeArgs(command, sink) {
    sink(command.loc.index);
    sink(Number([...command.nums].map(String).join('')));
  },
  deserializeArgs(source): [loc: Loc, nums: Set<number>] {
    return [Loc.of(source()), new Set(String(source()).split('').map(Number))];
  },
};
const undo: Serializer<typeof Undo> = {
  tag: 6,
  ctor: Undo,
  serializeArgs: noSerialize,
  deserializeArgs: noDeserialize,
};
const redo: Serializer<typeof Redo> = {
  tag: 7,
  ctor: Redo,
  serializeArgs: noSerialize,
  deserializeArgs: noDeserialize,
};
const undoToStart: Serializer<typeof UndoToStart> = {
  tag: 8,
  ctor: UndoToStart,
  serializeArgs: noSerialize,
  deserializeArgs: noDeserialize,
};
const redoToEnd: Serializer<typeof RedoToEnd> = {
  tag: 9,
  ctor: RedoToEnd,
  serializeArgs: noSerialize,
  deserializeArgs: noDeserialize,
};
const createTrail: Serializer<typeof CreateTrail> = {
  tag: 10,
  ctor: CreateTrail,
  serializeArgs: noSerialize,
  deserializeArgs: noDeserialize,
};
const activateTrail: Serializer<typeof ActivateTrail> = {
  tag: 11,
  ctor: ActivateTrail,
  serializeArgs: serializeTrailId,
  deserializeArgs: deserializeTrailId,
};
const toggleTrailVisibility: Serializer<typeof ToggleTrailVisibility> = {
  tag: 12,
  ctor: ToggleTrailVisibility,
  serializeArgs: serializeTrailId,
  deserializeArgs: deserializeTrailId,
};
const archiveTrail: Serializer<typeof ArchiveTrail> = {
  tag: 13,
  ctor: ArchiveTrail,
  serializeArgs: serializeTrailId,
  deserializeArgs: deserializeTrailId,
};
const toggleTrailsActive: Serializer<typeof ToggleTrailsActive> = {
  tag: 14,
  ctor: ToggleTrailsActive,
  serializeArgs: noSerialize,
  deserializeArgs: noDeserialize,
};
const copyFromTrail: Serializer<typeof CopyFromTrail> = {
  tag: 15,
  ctor: CopyFromTrail,
  serializeArgs: serializeTrailId,
  deserializeArgs: deserializeTrailId,
};

const serializersByTag: ReadonlyArray<Serializer<any>> = [
  resume,
  pause,
  markComplete,
  clearCell,
  setNum,
  setNums,
  undo,
  redo,
  undoToStart,
  redoToEnd,
  createTrail,
  activateTrail,
  toggleTrailVisibility,
  archiveTrail,
  toggleTrailsActive,
  copyFromTrail,
];

const serializersByCtor: ReadonlyMap<Function, Serializer<any>> = new Map(
  serializersByTag.map((s, i) => {
    if (i != s.tag) {
      throw new Error(
        `The serializer for command ${s.ctor.name} should have tag ${i} but has ${s.tag}`,
      );
    }
    return [s.ctor, s];
  }),
);
