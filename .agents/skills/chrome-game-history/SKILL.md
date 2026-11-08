---
name: chrome-game-history
description: >-
  Read, decode, and analyze Luke-doku puzzle records and move-by-move game
  histories from the user's local Chrome profile IndexedDB. Use this skill
  whenever a task requires inspecting real player gameplay data, solve times,
  completed puzzles, or command histories from Chrome on macOS.
---

# Reading Luke-doku Game Histories from Chrome

Luke-doku stores all puzzle records and move-by-move game histories in an IndexedDB database named `luke-doku` (object store `puzzles`, defined in [`www/src/system/database.ts`](../../../www/src/system/database.ts)).

On macOS, Chrome persists this IndexedDB as a LevelDB directory at:
- **Local dev server (primary history):**
  `/Users/luke/Library/Application Support/Google/Chrome/Default/IndexedDB/http_localhost_8080.indexeddb.leveldb`
- **GitHub Pages origin (if needed):**
  `/Users/luke/Library/Application Support/Google/Chrome/Default/IndexedDB/https_leadpipe.github.io_0.indexeddb.leveldb`

---

## Workflow

### Step 1: Copy the LevelDB Directory into `/tmp` or Scratch

Because `~/Library/Application Support/Google/Chrome` is outside the workspace, copy the `.indexeddb.leveldb` directory into `/tmp/luke-doku-idb` (or your conversation `scratch/` directory) so all subsequent parsing runs inside the sandbox and avoids conflicting with Chrome's `LOCK` file:

1. Create the destination directory inside the sandbox:
   ```zsh
   mkdir -p /tmp/luke-doku-idb
   ```
2. Copy the LevelDB directory (requires `BypassSandbox: true` after attempting in standard sandbox mode):
   ```zsh
   cp -R "/Users/luke/Library/Application Support/Google/Chrome/Default/IndexedDB/http_localhost_8080.indexeddb.leveldb" /tmp/luke-doku-idb/
   ```

### Step 2: Run the Helper Script

Use [read_game_histories.mjs](./scripts/read_game_histories.mjs) inside the sandbox to inspect summary statistics or export all records to JSON:

```zsh
# Print summary counts, complexity breakdown, and date range
node .agents/skills/chrome-game-history/scripts/read_game_histories.mjs /tmp/luke-doku-idb/http_localhost_8080.indexeddb.leveldb

# Export all PuzzleRecords (with decoded command histories) to JSON
node .agents/skills/chrome-game-history/scripts/read_game_histories.mjs /tmp/luke-doku-idb/http_localhost_8080.indexeddb.leveldb --decode-commands --json /tmp/luke-doku-idb/histories.json
```

### Step 3: Custom Analysis (ES Module Import)

For custom analysis scripts (e.g., training/evaluating solve-time models, analyzing trail usage, or computing per-move cadence), import [read_game_histories.mjs](./scripts/read_game_histories.mjs) directly:

```js
import {
  loadPuzzleRecords,
  deserializeCommands,
  CommandTag,
  CompletionState,
} from '/Users/luke/code/luke-doku/.agents/skills/chrome-game-history/scripts/read_game_histories.mjs';

const records = loadPuzzleRecords(
  '/tmp/luke-doku-idb/http_localhost_8080.indexeddb.leveldb',
  { decodeCommands: true }
);

for (const r of records) {
  if (r.attemptState !== 'completed') continue;
  // r.clues, r.solutions, r.puzzleId, r.complexity, r.lastUpdated, r.elapsedMs
  // r.history (Int8Array), r.decodedHistory (Array of { tag, type, ...args, elapsedTimestamp })
  // r.previousAttempts (Int8Array[]), r.decodedPreviousAttempts
}
```

---

## Technical Details & Gotchas

1. **LevelDB SSTables + WAL Logs:** Active Chrome IndexedDB directories store recent writes in `.log` (32 KB block-framed Write-Ahead Logs) and compacted writes in Snappy-compressed `.ldb` SSTables. [read_game_histories.mjs](./scripts/read_game_histories.mjs) parses both and deduplicates records by LevelDB sequence number so you always get the latest state of every puzzle.
2. **V8 Serialization Version Byte (`0x10` -> `0x0f`):** Chrome's Blink/V8 structured clone header starts with `0xff 0x10 0x6f`, whereas Node.js v22's built-in `v8.deserialize()` expects version `0x0f` (`0xff 0x0f 0x6f`). Patching that single version byte allows `v8.deserialize()` to reconstruct the entire `PuzzleRecord` (including `Date` and `Int8Array` fields) natively with zero external dependencies.
3. **`history` vs `previousAttempts`:** When a puzzle is completed, its command log remains in `record.history`. `record.previousAttempts` is only populated when a completed puzzle is replayed via `playAgain()` in [`www/src/game/game.ts`](../../../www/src/game/game.ts).
4. **Elapsed Time & Completion State:** `record.elapsedMs` stores the total elapsed solve time in milliseconds, while the `MARK_COMPLETED` command in `record.history` distinguishes whether the puzzle was solved (`CompletionState.SOLVED === 0`) or abandoned (`CompletionState.QUIT === 1`).
