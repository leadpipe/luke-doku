import {type DBSchema, type IDBPDatabase, openDB} from 'idb';
import * as wasm from 'luke-doku-rust';

/**
 * Opens the IndexedDB that Luke-doku stores puzzles in.
 */
export function openDb(): Promise<IDBPDatabase<LukeDokuDb>> {
  return openDB<LukeDokuDb>('luke-doku', 1, {
    upgrade(database) {
      const store = database.createObjectStore('puzzles', {keyPath: 'clues'});
      store.createIndex('byPuzzleId', 'puzzleId');
      store.createIndex('byStateAndDate', ['attemptState', 'lastUpdated']);
    },
  });
}

/**
 * The schema for the Luke-doku IndexedDB.
 */
export interface LukeDokuDb extends DBSchema {
  puzzles: {
    /** The clues in GridString form. */
    key: string;
    value: {
      // --------------- parts of the Sudoku object --------------- //

      /** The clues in GridString form. */
      clues: string;
      /** The set of solutions, each in GridString form. */
      solutions: string[];
      /** The grid symmetries exhibited by this puzzle's clues. */
      symmetryMatches: DbSymMatch[];
      /**
       * The puzzle ID, if we generated the puzzle, as [date, counter,
       * genVersion]: for example, ['1776-07-04', 10, 1] is the tenth puzzle
       * generated for US Independence Day by version 1 of the puzzle generator.
       */
      puzzleId?: [string, number, number];
      /**
       * Typically only set for external puzzles: a description of where this
       * puzzle came from.
       */
      source?: string;

      // -------- the state of attempts to solve the puzzle -------- //

      /** The state of the most recent attempt, if any. */
      attemptState: AttemptState;
      /** When the puzzle record was last updated in the database. */
      lastUpdated: Date;
      /** For ongoing puzzles, the serialized history of the game so far. */
      history?: Int8Array;
      /**
       * For ongoing puzzles, the total elapsed milliseconds in the game.  This
       * is periodically updated separately from the history, to deal with
       * situations where the game is not properly paused before the app process
       * is killed.
       */
      elapsedMs?: number;

      /**
       * Collects the histories of all attempts to solve the puzzle that were
       * completed, whether by solving or quitting.
       */
      previousAttempts?: Int8Array[];
    };

    indexes: {
      /**
       * Lets you find a particular generated puzzle, or all the generated
       * puzzles for a particular day.
       */
      byPuzzleId: [string, number];

      /**
       * Lets you find all the puzzles in a given state, ordered by last updated
       * time.
       */
      byStateAndDate: [AttemptState, Date];
    };
  };
}

/** The shape of records in the database. */
export type PuzzleRecord = LukeDokuDb['puzzles']['value'];

/** The version of SymMatch that we store in the database. */
export interface DbSymMatch {
  /** The grid symmetry. */
  sym: wasm.Sym;
  /**
   * The sets of clue location "orbits" that exactly match the symmetry, meaning
   * that every location in each of these orbits contains a clue.  The locations
   * are represented as their numeric row-major indices within the grid.
   */
  fullOrbits: Int8Array[];
  /** How many clue locations fail to match the symmetry. */
  numNonconformingLocs: number;
  /**
   * Same as `fullOrbits`, but has the orbits that are only partially filled by
   * clues.
   */
  partialOrbits: Int8Array[];
}

/** Similar to PlayState, but combines "running" and "paused" as "ongoing". */
export enum AttemptState {
  /** No attempt has been made on this puzzle. */
  UNSTARTED = 'unstarted',
  /** An attempt to solve this puzzle is underway. */
  ONGOING = 'ongoing',
  /** The most recent attempt has been finished, either by solving it or by giving up. */
  COMPLETED = 'completed',
}
