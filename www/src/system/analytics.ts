/**
 * All the kinds of events we log to Google Analytics.
 */
export enum EventType {
  // The person did something.
  ACTION = 'ld_action', // "ld" = Luke-doku

  // The computer did something.
  SYSTEM = 'ld_system',

  // Something bad happened.
  ERROR = 'ld_error',
}

/**
 * Extra information we might include with an event.
 */
export declare interface EventParams {
  category?: string;
  detail?: string;
  elapsedMs?: number;
}

declare const debugMode: boolean;
export function log(message: string, ...args: any[]) {
  if (debugMode) {
    console.log(new Date().toLocaleString(), message, ...args);
  }
}

/**
 * Logs something that happened to Google Analytics.
 * @param event What happened.
 */
export function logEvent(event: EventType, params: EventParams = {}) {
  log('LOG EVENT', event, params);
  gtag('event', event, params);
}
