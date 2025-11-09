import type {Game} from '../game/game';
import {Loc} from '../game/loc';
import type {HashState} from './nav';
import {Theme} from './types';

declare global {
  interface HTMLElementEventMap {
    /**
     * Sent to switch to the solve page showing the given Game.
     */
    'play-puzzle': CustomEvent<Game>;
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

  interface WindowEventMap {
    /**
     * Sent when the browser URL changes, either due to the user's using the
     * browser to go backwards or forwards, or due to the app navigating
     * somewhere.
     */
    'hash-state-changed': CustomEvent<HashState>;
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

export class PrefsEventTarget extends EventTarget {}

type CustomEventPayload<T> = T extends CustomEvent<infer U> ? U : never;

interface EventMaps {
  HTMLElement: HTMLElementEventMap;
  Window: WindowEventMap;
  Prefs: PrefsEventMap;
}

/**
 * Adds a type-safe event listener to a Window.
 *
 * @param target The object to add the event listener to.
 * @param eventName The name of the event.
 * @param listener The event listener function.
 */
export function addTypeSafeListener<K extends keyof WindowEventMap>(
  target: Window,
  eventName: K,
  listener: (event: WindowEventMap[K]) => void,
): void;
/**
 * Adds a type-safe event listener to an element.
 *
 * @param target The object to add the event listener to.
 * @param eventName The name of the event.
 * @param listener The event listener function.
 */
export function addTypeSafeListener<K extends keyof HTMLElementEventMap>(
  target: HTMLElement,
  eventName: K,
  listener: (event: HTMLElementEventMap[K]) => void,
): void;
/**
 * Adds a type-safe event listener to a prefs target.
 *
 * @param target The object to add the event listener to.
 * @param eventName The name of the event.
 * @param listener The event listener function.
 */
export function addTypeSafeListener<K extends keyof PrefsEventMap>(
  target: PrefsEventTarget,
  eventName: K,
  listener: (event: PrefsEventMap[K]) => void,
): void;
/**
 * Adds a type-safe event listener to any valid EventTarget (Window, HTMLElement, PrefsEventTarget).
 *
 * @param target The object to add the event listener to (window, element, prefs target).
 * @param eventName The name of the event.
 * @param listener The event listener function.
 */
export function addTypeSafeListener<
  T extends keyof EventMaps,
  K extends keyof EventMaps[T],
>(
  target: T extends 'Window' ? Window
  : T extends 'HTMLElement' ? HTMLElement
  : PrefsEventTarget,
  eventName: K,
  listener: (event: EventMaps[T][K]) => void,
): void {
  // We have to use a type assertion here because TypeScript can't perfectly
  // reconcile the generic constraints with the implementation's union types:
  target.addEventListener(eventName as string, listener as EventListener);
}

/**
 * Removes a type-safe event listener from a Window.
 *
 * @param target The object to remove the event listener from.
 * @param eventName The name of the event.
 * @param listener The event listener function.
 */
export function removeTypeSafeListener<K extends keyof WindowEventMap>(
  target: Window,
  eventName: K,
  listener: (event: WindowEventMap[K]) => void,
): void;
/**
 * Removes a type-safe event listener from an element.
 *
 * @param target The object to remove the event listener from.
 * @param eventName The name of the event.
 * @param listener The event listener function.
 */
export function removeTypeSafeListener<K extends keyof HTMLElementEventMap>(
  target: HTMLElement,
  eventName: K,
  listener: (event: HTMLElementEventMap[K]) => void,
): void;
/**
 * Removes a type-safe event listener from a prefs target.
 *
 * @param target The object to remove the event listener from.
 * @param eventName The name of the event.
 * @param listener The event listener function.
 */
export function removeTypeSafeListener<K extends keyof PrefsEventMap>(
  target: PrefsEventTarget,
  eventName: K,
  listener: (event: PrefsEventMap[K]) => void,
): void;
/**
 * Removes a type-safe event listener from any valid EventTarget (Window, HTMLElement, PrefsEventTarget).
 *
 * This mirrors `addTypeSafeListener` and uses the same generic constraints so
 * callers get correct typing for the event parameter.
 */
export function removeTypeSafeListener<
  T extends keyof EventMaps,
  K extends keyof EventMaps[T],
>(
  target: T extends 'Window' ? Window
  : T extends 'HTMLElement' ? HTMLElement
  : PrefsEventTarget,
  eventName: K,
  listener: (event: EventMaps[T][K]) => void,
): void {
  // As with addTypeSafeListener, assert to EventListener for the runtime call.
  target.removeEventListener(eventName as string, listener as EventListener);
}

/**
 * Dispatches a type-safe custom event on a Window.
 *
 * @param target The object to dispatch the event on.
 * @param eventName The name of the event.
 * @param detail The payload (detail) of the event.
 */
export function dispatchTypeSafeEvent<K extends keyof WindowEventMap>(
  target: Window,
  eventName: K,
  detail: CustomEventPayload<WindowEventMap[K]>,
): void;
/**
 * Dispatches a type-safe custom event on an HTMLElement.
 *
 * @param target The object to dispatch the event on.
 * @param eventName The name of the event.
 * @param detail The payload (detail) of the event.
 */
export function dispatchTypeSafeEvent<K extends keyof HTMLElementEventMap>(
  target: HTMLElement,
  eventName: K,
  detail: CustomEventPayload<HTMLElementEventMap[K]>,
): void;
/**
 * Dispatches a type-safe custom event on a PrefsEventTarget.
 *
 * @param target The object to dispatch the event on.
 * @param eventName The name of the event.
 * @param detail The payload (detail) of the event.
 */
export function dispatchTypeSafeEvent<K extends keyof PrefsEventMap>(
  target: PrefsEventTarget,
  eventName: K,
  detail: CustomEventPayload<PrefsEventMap[K]>,
): void;
/**
 * Dispatches a type-safe custom event on any valid EventTarget (Window, HTMLElement, PrefsEventTarget).
 *
 * @param target The object to dispatch the event on (window, element, prefs target).
 * @param eventName The name of the event.
 * @param detail The payload (detail) of the event.
 */
export function dispatchTypeSafeEvent<
  // TKey: Determines which event map to use (e.g., 'Window', 'HTMLElement')
  TKey extends keyof EventMaps,
  // EName: Ensures the event name is a key in the selected map
  EName extends keyof EventMaps[TKey],
>(
  // We use conditional types to constrain the actual runtime instance passed in.
  target: TKey extends 'Window' ? Window
  : TKey extends 'HTMLElement' ? HTMLElement
  : PrefsEventTarget,
  eventName: EName,
  // We infer the correct detail payload type
  detail: CustomEventPayload<EventMaps[TKey][EName]>,
): void {
  // The type system has validated eventName and detail match for the given target.
  const event = new CustomEvent(eventName as string, {
    detail,
    bubbles: true,
    composed: true,
  });
  target.dispatchEvent(event);
}
