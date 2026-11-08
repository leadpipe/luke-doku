#!/usr/bin/env node
/**
 * Reads Luke-doku PuzzleRecord entries and game histories from a local Chrome
 * IndexedDB LevelDB directory (e.g., copied to /tmp/luke-doku-idb).
 *
 * Can be run as a CLI tool:
 *   node .agents/skills/chrome-game-history/scripts/read_game_histories.mjs [leveldb-dir] [--json out.json] [--decode-commands]
 *
 * Or imported as an ES module in custom analysis scripts:
 *   import { loadPuzzleRecords, deserializeCommands, CommandTag, CompletionState } from './read_game_histories.mjs';
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import v8 from 'node:v8';

export const CommandTag = Object.freeze({
  RESUME: 0,
  PAUSE: 1,
  MARK_COMPLETED: 2,
  GUESS_SOLUTIONS_COUNT: 3,
  CLEAR_CELL: 4,
  SET_NUM: 5,
  SET_NUMS: 6,
  UNDO: 7,
  REDO: 8,
  UNDO_TO_START: 9,
  REDO_TO_END: 10,
  CREATE_TRAIL: 11,
  ACTIVATE_TRAIL: 12,
  TOGGLE_TRAIL_VISIBILITY: 13,
  ARCHIVE_TRAIL: 14,
  TOGGLE_TRAILS_ACTIVE: 15,
  COPY_FROM_TRAIL: 16,
});

export const CommandTagName = Object.freeze(
  Object.fromEntries(Object.entries(CommandTag).map(([k, v]) => [v, k]))
);

export const CompletionState = Object.freeze({
  SOLVED: 0,
  QUIT: 1,
});

const SERIALIZE_VERSION = 0;

function readBase128(source) {
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

/**
 * Deserializes a Luke-doku `Int8Array` command history into an array of
 * `{ tag, type, args, elapsedTimestamp }` objects matching `www/src/game/serialize.ts`.
 *
 * @param {Int8Array | Uint8Array | number[]} serialized
 */
export function deserializeCommands(serialized) {
  if (!serialized || serialized.length === 0) return [];
  const int8 = serialized instanceof Int8Array ? serialized : new Int8Array(serialized);
  const answer = [];
  let index = 0;
  const source = () => {
    if (index >= int8.length) {
      throw new Error('Unexpected end of serialized command stream');
    }
    return int8[index++];
  };

  const version = source();
  if (version !== SERIALIZE_VERSION) {
    throw new Error(
      `Expected command serialization version ${SERIALIZE_VERSION}, got ${version}`
    );
  }

  let prevTimestamp = 0;
  while (index < int8.length) {
    const tag = readBase128(source);
    const type = CommandTagName[tag] ?? `UNKNOWN_${tag}`;
    let args = {};

    switch (tag) {
      case CommandTag.RESUME:
        args = { timestamp: readBase128(source) };
        break;
      case CommandTag.PAUSE:
        args = { reason: readBase128(source) };
        break;
      case CommandTag.MARK_COMPLETED: {
        const completionState = readBase128(source);
        args = {
          completionState,
          completionStateName: completionState === CompletionState.SOLVED ? 'SOLVED' : 'QUIT',
        };
        break;
      }
      case CommandTag.GUESS_SOLUTIONS_COUNT:
        args = { guess: readBase128(source) };
        break;
      case CommandTag.CLEAR_CELL:
        args = { loc: readBase128(source) };
        break;
      case CommandTag.SET_NUM:
        args = { loc: readBase128(source), num: readBase128(source) };
        break;
      case CommandTag.SET_NUMS: {
        const loc = readBase128(source);
        const digits = String(readBase128(source)).split('').map(Number);
        args = { loc, nums: digits };
        break;
      }
      case CommandTag.UNDO:
      case CommandTag.REDO:
      case CommandTag.UNDO_TO_START:
      case CommandTag.REDO_TO_END:
      case CommandTag.CREATE_TRAIL:
      case CommandTag.TOGGLE_TRAILS_ACTIVE:
        args = {};
        break;
      case CommandTag.ACTIVATE_TRAIL:
      case CommandTag.TOGGLE_TRAIL_VISIBILITY:
      case CommandTag.ARCHIVE_TRAIL:
      case CommandTag.COPY_FROM_TRAIL:
        args = { trailId: readBase128(source) };
        break;
      default:
        throw new Error(`Unknown command tag: ${tag}`);
    }

    const elapsedTimestamp = prevTimestamp + readBase128(source);
    prevTimestamp = elapsedTimestamp;
    answer.push({ tag, type, ...args, elapsedTimestamp });
  }

  return answer;
}

// --- LevelDB & Snappy Readers ---

function readVarint(buf, offset) {
  let result = 0n;
  let shift = 0n;
  let pos = offset;
  while (pos < buf.length) {
    const byte = buf[pos++];
    result |= BigInt(byte & 0x7f) << shift;
    if ((byte & 0x80) === 0) {
      return { value: Number(result), next: pos };
    }
    shift += 7n;
  }
  throw new Error('Truncated varint');
}

function snappyUncompress(compressed) {
  const { value: uncompressedLen, next: startPos } = readVarint(compressed, 0);
  const out = Buffer.alloc(uncompressedLen);
  let inPos = startPos;
  let outPos = 0;

  while (inPos < compressed.length) {
    const tag = compressed[inPos++];
    const type = tag & 0x03;
    if (type === 0) {
      let len = (tag >> 2) + 1;
      if (len > 60) {
        const extraBytes = len - 60;
        len = 0;
        for (let i = 0; i < extraBytes; i++) {
          len |= compressed[inPos++] << (8 * i);
        }
        len += 1;
      }
      compressed.copy(out, outPos, inPos, inPos + len);
      inPos += len;
      outPos += len;
    } else {
      let len;
      let offset;
      if (type === 1) {
        len = ((tag >> 2) & 0x07) + 4;
        offset = ((tag & 0xe0) << 3) | compressed[inPos++];
      } else if (type === 2) {
        len = (tag >> 2) + 1;
        offset = compressed.readUInt16LE(inPos);
        inPos += 2;
      } else {
        len = (tag >> 2) + 1;
        offset = compressed.readUInt32LE(inPos);
        inPos += 4;
      }
      let copySrc = outPos - offset;
      for (let i = 0; i < len; i++) {
        out[outPos++] = out[copySrc++];
      }
    }
  }
  return out;
}

function readBlock(fileBuf, offset, size) {
  const type = fileBuf[offset + size];
  const raw = fileBuf.subarray(offset, offset + size);
  if (type === 0) return raw;
  if (type === 1) return snappyUncompress(raw);
  throw new Error(`Unknown SSTable block compression type: ${type}`);
}

function* parseDataBlock(blockBuf) {
  const numRestarts = blockBuf.readUInt32LE(blockBuf.length - 4);
  const limit = blockBuf.length - 4 * (1 + numRestarts);
  let pos = 0;
  let prevKey = Buffer.alloc(0);

  while (pos < limit) {
    const s = readVarint(blockBuf, pos);
    const u = readVarint(blockBuf, s.next);
    const v = readVarint(blockBuf, u.next);
    pos = v.next;

    const shared = s.value;
    const unshared = u.value;
    const valLen = v.value;

    const keyDelta = blockBuf.subarray(pos, pos + unshared);
    pos += unshared;
    const value = blockBuf.subarray(pos, pos + valLen);
    pos += valLen;

    const key = Buffer.concat([prevKey.subarray(0, shared), keyDelta]);
    prevKey = key;
    yield { key, value };
  }
}

function* readSstable(filePath) {
  const buf = fs.readFileSync(filePath);
  if (buf.length < 48) return;
  const footer = buf.subarray(buf.length - 48);
  const mOff = readVarint(footer, 0);
  const mSize = readVarint(footer, mOff.next);
  const iOff = readVarint(footer, mSize.next);
  const iSize = readVarint(footer, iOff.next);

  const indexBlock = readBlock(buf, iOff.value, iSize.value);
  for (const { value: handleBuf } of parseDataBlock(indexBlock)) {
    const bOff = readVarint(handleBuf, 0);
    const bSize = readVarint(handleBuf, bOff.next);
    const dataBlock = readBlock(buf, bOff.value, bSize.value);
    for (const { key: internalKey, value } of parseDataBlock(dataBlock)) {
      if (internalKey.length < 8) continue;
      const userKey = internalKey.subarray(0, internalKey.length - 8);
      const tag = internalKey.readBigUInt64LE(internalKey.length - 8);
      const valueType = Number(tag & 0xffn);
      const seq = tag >> 8n;
      yield { seq, valueType, userKey, value };
    }
  }
}

function* parseWriteBatch(batchBuf) {
  if (batchBuf.length < 12) return;
  let seq = batchBuf.readBigUInt64LE(0);
  const count = batchBuf.readUInt32LE(8);
  let pos = 12;
  for (let i = 0; i < count && pos < batchBuf.length; i++) {
    const valueType = batchBuf[pos++];
    const k = readVarint(batchBuf, pos);
    const userKey = batchBuf.subarray(k.next, k.next + k.value);
    pos = k.next + k.value;
    let value = Buffer.alloc(0);
    if (valueType === 1) {
      const v = readVarint(batchBuf, pos);
      value = batchBuf.subarray(v.next, v.next + v.value);
      pos = v.next + v.value;
    }
    yield { seq: seq++, valueType, userKey, value };
  }
}

function* readWalLog(filePath) {
  const buf = fs.readFileSync(filePath);
  const BLOCK_SIZE = 32768;
  let pos = 0;
  let chunks = [];

  while (pos < buf.length) {
    const blockRem = BLOCK_SIZE - (pos % BLOCK_SIZE);
    if (blockRem < 7) {
      pos += blockRem;
      continue;
    }
    if (pos + 7 > buf.length) break;
    const crc = buf.readUInt32LE(pos);
    const length = buf.readUInt16LE(pos + 4);
    const type = buf[pos + 6];
    if (crc === 0 && length === 0 && type === 0) {
      pos += blockRem;
      continue;
    }
    pos += 7;
    const payload = buf.subarray(pos, pos + length);
    pos += length;

    if (type === 1) {
      yield* parseWriteBatch(payload);
    } else if (type === 2) {
      chunks = [payload];
    } else if (type === 3) {
      chunks.push(payload);
    } else if (type === 4) {
      chunks.push(payload);
      yield* parseWriteBatch(Buffer.concat(chunks));
      chunks = [];
    }
  }
}

/**
 * Deserializes a Blink/V8 IndexedDB value buffer into a Luke-doku PuzzleRecord.
 * Chrome's V8 serialization format uses version 0x10+, whereas Node 22 supports up to 0x0f;
 * patching the V8 version byte to 0x0f allows Node's built-in `v8.deserialize` to parse it.
 */
function tryDeserializePuzzle(valueBuf) {
  for (let i = 0; i < Math.min(valueBuf.length - 3, 64); i++) {
    if (
      valueBuf[i] === 0xff &&
      (valueBuf[i + 1] === 0x10 || valueBuf[i + 1] === 0x0f) &&
      valueBuf[i + 2] === 0x6f
    ) {
      const copy = Buffer.from(valueBuf.subarray(i));
      copy[1] = 0x0f;
      try {
        const obj = v8.deserialize(copy);
        if (obj && typeof obj === 'object' && typeof obj.clues === 'string') {
          return obj;
        }
      } catch (_) {
        // Not a valid PuzzleRecord V8 payload at this offset
      }
    }
  }
  return null;
}

/**
 * Loads all live `PuzzleRecord` entries from a Chrome `.indexeddb.leveldb` directory.
 *
 * @param {string} levelDbDir Path to the `.indexeddb.leveldb` folder
 * @param {{ decodeCommands?: boolean }} [options]
 * @returns {Array<object>} Array of PuzzleRecord objects ordered by `lastUpdated` ascending
 */
export function loadPuzzleRecords(levelDbDir, options = {}) {
  const files = fs.readdirSync(levelDbDir).sort();
  const entriesByKey = new Map();

  for (const f of files) {
    const full = path.join(levelDbDir, f);
    let gen = null;
    if (f.endsWith('.ldb') || f.endsWith('.sst')) {
      gen = readSstable(full);
    } else if (f.endsWith('.log')) {
      gen = readWalLog(full);
    }
    if (!gen) continue;

    for (const entry of gen) {
      const keyHex = entry.userKey.toString('hex');
      const prev = entriesByKey.get(keyHex);
      if (!prev || entry.seq >= prev.seq) {
        entriesByKey.set(keyHex, entry);
      }
    }
  }

  const puzzlesByClues = new Map();
  const sortedEntries = [...entriesByKey.values()].sort((a, b) =>
    a.seq < b.seq ? -1 : a.seq > b.seq ? 1 : 0
  );

  for (const entry of sortedEntries) {
    if (entry.valueType !== 1) continue;
    const obj = tryDeserializePuzzle(entry.value);
    if (obj) {
      if (options.decodeCommands) {
        obj.decodedHistory = obj.history ? deserializeCommands(obj.history) : [];
        if (obj.previousAttempts) {
          obj.decodedPreviousAttempts = obj.previousAttempts.map(a =>
            deserializeCommands(a)
          );
        }
      }
      puzzlesByClues.set(obj.clues, obj);
    }
  }

  return [...puzzlesByClues.values()].sort((a, b) => {
    const tA = a.lastUpdated instanceof Date ? a.lastUpdated.getTime() : 0;
    const tB = b.lastUpdated instanceof Date ? b.lastUpdated.getTime() : 0;
    return tA - tB;
  });
}

// --- CLI Entry Point ---

const isMain =
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isMain) {
  const args = process.argv.slice(2);
  let targetDir = '/tmp/luke-doku-idb/http_localhost_8080.indexeddb.leveldb';
  let jsonOut = null;
  let decode = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--json' && args[i + 1]) {
      jsonOut = args[++i];
    } else if (args[i] === '--decode-commands') {
      decode = true;
    } else if (!args[i].startsWith('--')) {
      targetDir = args[i];
    }
  }

  if (!fs.existsSync(targetDir)) {
    console.error(`LevelDB directory not found: ${targetDir}`);
    console.error(
      `Copy it from Chrome first, e.g.:\n  mkdir -p /tmp/luke-doku-idb\n  cp -R "/Users/luke/Library/Application Support/Google/Chrome/Default/IndexedDB/http_localhost_8080.indexeddb.leveldb" /tmp/luke-doku-idb/`
    );
    process.exit(1);
  }

  const records = loadPuzzleRecords(targetDir, { decodeCommands: decode });
  const byState = {};
  const byComplexity = {};
  let withHistory = 0;
  let withPrevAttempts = 0;
  let totalPrevAttempts = 0;

  for (const r of records) {
    byState[r.attemptState] = (byState[r.attemptState] || 0) + 1;
    if (r.attemptState === 'completed') {
      const cKey = r.complexity ?? 'unrated';
      byComplexity[cKey] = (byComplexity[cKey] || 0) + 1;
    }
    if (r.history && r.history.length > 0) withHistory++;
    if (r.previousAttempts && r.previousAttempts.length > 0) {
      withPrevAttempts++;
      totalPrevAttempts += r.previousAttempts.length;
    }
  }

  console.log(`Loaded ${records.length} PuzzleRecords from ${targetDir}`);
  console.log(`By attemptState:`, byState);
  console.log(`Completed by complexity (1-5):`, byComplexity);
  if (records.length > 0) {
    const firstDate = records[0].lastUpdated?.toISOString?.() ?? 'unknown';
    const lastDate = records[records.length - 1].lastUpdated?.toISOString?.() ?? 'unknown';
    console.log(`Date range: ${firstDate} -> ${lastDate}`);
  }
  console.log(`With history (Int8Array): ${withHistory}`);
  console.log(`With previousAttempts: ${withPrevAttempts} (total extra attempts: ${totalPrevAttempts})`);

  if (jsonOut) {
    const serializable = records.map(r => ({
      ...r,
      lastUpdated: r.lastUpdated instanceof Date ? r.lastUpdated.toISOString() : r.lastUpdated,
      history: r.history ? Array.from(r.history) : undefined,
      previousAttempts: r.previousAttempts
        ? r.previousAttempts.map(a => Array.from(a))
        : undefined,
      symmetryMatches: undefined,
    }));
    fs.writeFileSync(jsonOut, JSON.stringify(serializable, null, 2));
    console.log(`Wrote ${serializable.length} records to ${jsonOut}`);
  }
}
