/*
 * Functions to serialize and deserialize commands.
 */

import {Command, CompletionState, RecordedCommand} from './command';
import {
  ClearCell,
  MarkComplete,
  Pause,
  Redo,
  RedoToEnd,
  Resume,
  SetNum,
  SetNums,
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
    sink(c.elapsedTimestamp - prevTimestamp);
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
    const command = new s.ctor(s.deserializeArgs(source));
    const elapsedTimestamp = prevTimestamp + source();
    prevTimestamp = elapsedTimestamp;
    answer.push({command, elapsedTimestamp});
  }
  return answer;
}

interface CommandConstructor<T extends Command> {
  new (...args: any[]): T;
}

interface Serializer<T extends Command> {
  readonly tag: number;
  readonly ctor: CommandConstructor<T>;
  serializeArgs(command: T, sink: (value: number) => void): void;
  deserializeArgs(
    source: () => number,
  ): ConstructorParameters<CommandConstructor<T>>;
}

const noSerialize = () => {};
const noDeserialize = () => [];

const resume: Serializer<Resume> = {
  tag: 0,
  ctor: Resume,
  serializeArgs(command, sink) {
    sink(command.timestamp);
  },
  deserializeArgs(source) {
    return [source()];
  },
};
const pause: Serializer<Pause> = {
  tag: 1,
  ctor: Pause,
  serializeArgs: noSerialize,
  deserializeArgs: noDeserialize,
};
const markComplete: Serializer<MarkComplete> = {
  tag: 2,
  ctor: MarkComplete,
  serializeArgs(command, sink) {
    sink(command.completionState);
  },
  deserializeArgs(source): [state: CompletionState] {
    return [source()];
  },
};
const clearCell: Serializer<ClearCell> = {
  tag: 3,
  ctor: ClearCell,
  serializeArgs(command, sink) {
    sink(command.loc.index);
  },
  deserializeArgs(source): [loc: Loc] {
    return [Loc.of(source())];
  },
};
const setNum: Serializer<SetNum> = {
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
const setNums: Serializer<SetNums> = {
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
const undo: Serializer<Undo> = {
  tag: 6,
  ctor: Undo,
  serializeArgs: noSerialize,
  deserializeArgs: noDeserialize,
};
const redo: Serializer<Redo> = {
  tag: 7,
  ctor: Redo,
  serializeArgs: noSerialize,
  deserializeArgs: noDeserialize,
};
const undoToStart: Serializer<UndoToStart> = {
  tag: 8,
  ctor: UndoToStart,
  serializeArgs: noSerialize,
  deserializeArgs: noDeserialize,
};
const redoToEnd: Serializer<RedoToEnd> = {
  tag: 9,
  ctor: RedoToEnd,
  serializeArgs: noSerialize,
  deserializeArgs: noDeserialize,
};

const serializersByTag: ReadonlyArray<Serializer<Command>> = [
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
];

const serializersByCtor: ReadonlyMap<Function, Serializer<Command>> = new Map(
  serializersByTag.map((s, i) => {
    if (i != s.tag) {
      throw new Error(
        `The serializer for command ${s.ctor.name} should have tag ${i} but has ${s.tag}`,
      );
    }
    return [s.ctor, s];
  }),
);
