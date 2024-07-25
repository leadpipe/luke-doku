import * as wasm from 'luke-doku-rust';
import {Theme} from './types';

declare global {
  interface HTMLElementEventMap {
    'puzzle-selected': CustomEvent<wasm.Grid>;
    /**
     * Sent by game-clock when another second has passed.  The event detail
     * tells whether the clock was being shown.
     */
    'clock-ticked': CustomEvent<boolean>;
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
