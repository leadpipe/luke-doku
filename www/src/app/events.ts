import { Loc } from 'src/game/loc';
import {Grid} from '../game/grid';
import {Theme} from './types';

declare global {
  interface HTMLElementEventMap {
    'puzzle-selected': CustomEvent<Grid>;
    /**
     * Sent by game-clock when another second has passed.  The event detail
     * tells whether the clock was being shown.
     */
    'clock-ticked': CustomEvent<boolean>;
    /**
     * Sent by sudoku-view (via sudoku-input) when the puzzle has been solved.
     */
    'puzzle-solved': CustomEvent;
    /**
     * Sent by sudoku-view (via sudoku-input) when the user has changed the
     * contents of a cell. The event detail says which cell.
     */
    'cell-modified': CustomEvent<Loc>;
  }
}

/**
 * The custom events sent by the preferences module.
 */
export interface PrefsEventMap {
  /** Sent by prefs when the current theme changes (for any reason). */
  'current-theme': CustomEvent<Theme>;

  /** Sent by prefs when the showClock pref changes. */
  'show-clock': CustomEvent<boolean>;
}

export class PrefsEventTarget extends EventTarget {
  override addEventListener<K extends keyof PrefsEventMap>(
    type: K,
    listener: (this: PrefsEventTarget, ev: PrefsEventMap[K]) => any,
    options?: boolean | AddEventListenerOptions,
  ): void {
    super.addEventListener(type, listener as EventListener, options);
  }
  override removeEventListener<K extends keyof PrefsEventMap>(
    type: K,
    listener: (this: PrefsEventTarget, ev: PrefsEventMap[K]) => any,
    options?: boolean | EventListenerOptions,
  ): void {
    super.removeEventListener(type, listener as EventListener, options);
  }
}
