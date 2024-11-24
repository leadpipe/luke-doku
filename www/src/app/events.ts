import {Loc} from '../game/loc';
import {Sudoku} from '../game/sudoku';
import {Theme} from './types';

declare global {
  interface HTMLElementEventMap {
    /**
     * Sent to switch to the solve page showing the given Sudoku.
     */
    'play-puzzle': CustomEvent<Sudoku>;
    /**
     * Sent by game-clock when another second has passed.  The event detail
     * tells whether the clock was being shown.
     */
    'clock-ticked': CustomEvent<boolean>;
    /**
     * Sent by sudoku-view (via sudoku-input) when the puzzle has been solved.
     */
    'puzzle-solved': CustomEvent<void>;
    /**
     * Sent by sudoku-view (via sudoku-input) when the user has changed the
     * contents of a cell. The event detail says which cell.
     */
    'cell-modified': CustomEvent<Loc>;
    /**
     * Sent to return to the puzzles page.
     */
    'show-puzzles-page': CustomEvent<void>;
  }
}

type CustomEventPayload<T> = T extends CustomEvent<infer U> ? U : never;
export function customEvent<
  EventName extends keyof HTMLElementEventMap,
  Payload extends CustomEventPayload<HTMLElementEventMap[EventName]>,
>(
  eventName: EventName,
  payload: Omit<CustomEventInit<Payload>, 'detail'> & {detail: Payload},
): CustomEvent<Payload> {
  return new CustomEvent(eventName, payload);
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

export function prefsEvent<
  EventName extends keyof PrefsEventMap,
  Payload extends CustomEventPayload<PrefsEventMap[EventName]>,
>(
  eventName: EventName,
  payload: Omit<CustomEventInit<Payload>, 'detail'> & {detail: Payload},
): CustomEvent<Payload> {
  return new CustomEvent(eventName, payload);
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
