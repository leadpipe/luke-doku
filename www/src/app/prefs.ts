import './events';
import {prefsEvent, PrefsEventTarget} from './events';
import {Theme, ThemeOrAuto} from './types';
import {todayString} from './utils';

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

// The meta tag defining the app's color scheme.
const colorScheme = document.querySelector('meta[name="color-scheme"]');

export function setPreferredTheme(theme: ThemeOrAuto) {
  colorScheme?.setAttribute('content', theme === 'auto' ? 'light dark' : theme);
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
    prefsTarget.dispatchEvent(prefsEvent('current-theme', {detail: next}));
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

if (getCurrentTheme() !== getCurrentSystemTheme()) {
  // Updates the meta tag with the user's saved preference, at startup time.
  setPreferredTheme(preferredTheme);
}

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
  prefsTarget.dispatchEvent(prefsEvent('show-clock', {detail: flag}));
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

let puzzleDate = '';
{
  const stored = window.localStorage.getItem('puzzleDate');
  if (stored) {
    puzzleDate = stored;
  }
}

/**
 * Returns the date (in YYYY-MM-DD form) of the last puzzle-of-the-day shown to the user.
 */
export function getPuzzleDate(): string {
  return puzzleDate;
}

export function setPuzzleDateToToday() {
  puzzleDate = todayString;
  window.localStorage.setItem('puzzleDate', todayString);
}
