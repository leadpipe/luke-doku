import './events';
import {PrefsEventTarget} from './events';
import {Theme, ThemeOrAuto} from './types';

/**
 * The event target for prefs events.
 */
export const prefsTarget = new PrefsEventTarget();

/** Tracks the color scheme/theme used by this device by default. */
let systemTheme: Theme = 'light';

/** Returns the color scheme/theme used on this device by default. */
export function getCurrentSystemTheme(): Theme {
  return systemTheme;
}

let preferredTheme: ThemeOrAuto = 'auto';
{
  const stored = window.localStorage.getItem('preferredTheme');
  switch (stored) {
    case 'dark':
    case 'light':
      preferredTheme = stored;
      break;
  }
}

export function getCurrentTheme(): Theme {
  return preferredTheme === 'auto' ? systemTheme : preferredTheme;
}

export function getPreferredTheme(): ThemeOrAuto {
  return preferredTheme;
}

export function setPreferredTheme(theme: ThemeOrAuto) {
  if (theme !== preferredTheme) {
    const prev = getCurrentTheme();
    preferredTheme = theme;
    window.localStorage.setItem('preferredTheme', theme);
    dispatchThemeChange(prev);
  }
}

/**
 * If the current theme differs from the given previous one, dispatches a
 * 'current-theme' event to let the app know about the change.
 */
function dispatchThemeChange(prev: Theme) {
  const next = getCurrentTheme();
  if (next !== prev) {
    prefsTarget.dispatchEvent(new CustomEvent('current-theme', {detail: next}));
  }
}

const darkModeQuery = window.matchMedia('(prefers-color-scheme: dark)');
function handleDarkModeChange(evt: {matches: boolean}) {
  const prev = getCurrentTheme();
  systemTheme = evt.matches ? 'dark' : 'light';
  dispatchThemeChange(prev);
}
handleDarkModeChange(darkModeQuery);
darkModeQuery.addEventListener('change', handleDarkModeChange);

let showClock = true;
{
  const stored = window.localStorage.getItem('showClock');
  if (stored === 'false') {
    showClock = false;
  }
}

export function getShowClock(): boolean {
  return showClock;
}

export function setShowClock(flag: boolean) {
  showClock = flag;
  window.localStorage.setItem('showClock', String(flag));
  prefsTarget.dispatchEvent(new CustomEvent('show-clock', {detail: flag}));
}

let seenHelp = false;
{
  const stored = window.localStorage.getItem('seenHelp');
  if (stored === 'true') {
    seenHelp = true;
  }
}

export function getSeenHelp(): boolean {
  return seenHelp;
}

export function setSeenHelp() {
  seenHelp = true;
  window.localStorage.setItem('seenHelp', 'true');
}
