// Browser navigation module.

import {PuzzleId} from '../game/sudoku';
import {EventType, logEvent} from '../system/analytics';
import {puzzleTitleFromId} from './utils';

/**
 * A clone (slightly altered) of the new NavigationHistoryEntry interface, which
 * is not yet available in all browsers.
 */
declare interface HistoryEntry {
  url: string;
  index: number;
}

/**
 * Tracks the current browser location history.
 */
declare interface HistoryStack {
  index: number;
  entries: HistoryEntry[];
}

/**
 * The state stored in the URL hash.
 */
export interface HashState {
  path: string[];
  params: URLSearchParams;
}

/**
 * Parses the given (or current) URL hash and returns its state.
 */
export function getHashState(url?: string): HashState {
  if (!url) {
    url = window.location.href;
  }
  const hashIndex = url.indexOf('#');
  const hash = hashIndex >= 0 ? url.substring(hashIndex + 1) : '';
  const hashUrl = new URL('http://example.com/' + hash);
  const path = hashUrl.pathname.substring(1).split('/').map(decodeURIComponent);
  return {
    path,
    params: hashUrl.searchParams,
  };
}

function getUrl(hashState: HashState): string {
  const hashPath = hashState.path.map(encodeURIComponent).join('/');
  const search = hashState.params.toString();
  if (!hashPath && !search) {
    return baseUrl;
  }
  return baseUrl + '#' + hashPath + (search ? '?' + search : '');
}

/**
 * Returns all prefix URLs for the given hash state, starting from the base URL,
 * through all the path components, and finally including all the parameters.
 */
function getPrefixUrls(hashState: HashState): string[] {
  const urls: string[] = [];
  const {path} = hashState;
  for (let i = 0; i <= path.length; ++i) {
    const subPath = path.slice(0, i);
    const hashState: HashState = {
      path: subPath,
      params: new URLSearchParams(),
    };
    urls.push(getUrl(hashState));
  }
  const params = new URLSearchParams();
  for (const [key, value] of hashState.params) {
    params.append(key, value);
    urls.push(getUrl({path, params}));
  }
  return urls;
}

/**
 * Replaces the history entry at the given index with the given URL, or pushes a
 * new entry if the index is beyond the end of the entries array. Returns true
 * if a new entry was pushed, false if an existing entry was replaced.
 */
function pushOrReplace(
  entries: HistoryEntry[],
  index: number,
  url: string,
): boolean {
  if (entries.length > index) {
    entries[index].url = url;
    return false; // replaced
  }
  entries[index] = {
    url,
    index,
  };
  return true; // pushed
}

function getDocumentTitle(hashState: HashState): string {
  const {path} = hashState;
  if (path.length) {
    const id = PuzzleId.parse(path[0]);
    if (id) {
      const puzzleTitle = puzzleTitleFromId(id, /*assumeToday=*/ false);
      if (path[1] === 'review') {
        return `Review ${puzzleTitle}`;
      }
      return puzzleTitle;
    }
  }
  return 'Luke-doku';
}

function updateEntriesAndTitle(
  entries: HistoryEntry[],
  index: number,
  url: string,
) {
  const pushed = pushOrReplace(entries, index, url);
  if (pushed) {
    window.history.pushState(null, '', url);
  } else {
    window.history.replaceState(null, '', url);
  }
  const hashState = getHashState(url);
  document.title = getDocumentTitle(hashState);
}

/**
 * Aligns the given history stack with the given hash state by pushing,
 * replacing, or going back as needed.
 */
function alignHistoryStack(stack: HistoryStack, hashState: HashState) {
  const {path} = hashState;
  const prefixUrls = getPrefixUrls({path, params: new URLSearchParams()});
  // Find the first entry that differs from the implied history stack.
  let i = 0;
  for (; i < prefixUrls.length; ++i) {
    const url = prefixUrls[i];
    if (stack.entries[i]?.url !== url) {
      break;
    }
  }
  // Go back if needed, or replace if the very first entry differs.
  const targetIndex = i - 1;
  if (targetIndex < 0) {
    if (stack.index > 0) {
      window.history.go(-stack.index);
      stack.index = 0;
    }
    updateEntriesAndTitle(stack.entries, 0, prefixUrls[0]);
  } else if (stack.index > targetIndex) {
    window.history.go(targetIndex - stack.index);
    stack.index = targetIndex;
  }
  // If we need to push new entries, first trim the array.
  if (i < prefixUrls.length) {
    stack.entries = stack.entries.slice(0, stack.index + 1);
  }
  for (; i < prefixUrls.length; ++i) {
    const url = prefixUrls[i];
    updateEntriesAndTitle(stack.entries, i, url);
    stack.index = i;
  }
  window.sessionStorage.setItem('historyStack', JSON.stringify(stack));
}

const baseUrl = window.location.href.replace(/(#.*)?$/, '');

const historyStack: Promise<HistoryStack> = (async () => {
  // TODO: Use the real NavigationHistory API when available.
  const fullUrl = window.location.href;
  const stored = window.sessionStorage.getItem('historyStack');
  if (stored) {
    try {
      const parsed = JSON.parse(stored);
      if (
        typeof parsed === 'object' &&
        parsed !== null &&
        Array.isArray(parsed.entries) &&
        typeof parsed.index === 'number' &&
        parsed.entries[parsed.index]?.url === fullUrl
      ) {
        return parsed;
      }
    } catch {}
    // The stored history stack doesn't match the current URL.
    logEvent(EventType.ERROR, {
      category: 'history stack mismatch',
      detail: stored,
    });
  }
  const stack: HistoryStack = {
    index: 0,
    entries: [
      {
        url: baseUrl,
        index: 0,
      },
    ],
  };
  window.history.replaceState(null, '', baseUrl);
  alignHistoryStack(stack, getHashState(fullUrl));
  return stack;
})();

window.addEventListener('popstate', async () => {
  const stack = await historyStack;
  const fullUrl = window.location.href;
  const index = stack.entries.findIndex(entry => entry.url === fullUrl);
  if (index >= 0) {
    stack.index = index;
    window.sessionStorage.setItem('historyStack', JSON.stringify(stack));
  } else {
    // The current URL is not in our history stack; rebuild the stack.
    logEvent(EventType.ERROR, {
      category: 'history stack missing entry',
      detail: fullUrl,
    });
    alignHistoryStack(stack, getHashState(fullUrl));
  }
});

/**
 * Navigates to the base URL, which shows the puzzles page.  This consists of
 * going back in history to the original page.
 */
export async function navigateHome() {
  return navigateToPath(); // empty path == home
}

/**
 * Navigates back one entry in history, if possible.
 */
export async function navigateBack() {
  window.history.back(); // Our popstate handler will update the stack.
}

/**
 * Navigates to the given path by pushing a new history entry, maintaining the
 * invariant that the history entries correspond to all prefixes of the path.
 */
export async function navigateToPath(...path: string[]) {
  return navigateToHashState({path, params: new URLSearchParams()});
}

/**
 * Navigates to the given hash state by reconciling its implied history state
 * stack with the current stack, pushing new or replacement entries as needed,
 * and maintaining the invariant that the history entries correspond to all
 * prefixes of the path and parameters.
 */
export async function navigateToHashState(hashState: HashState) {
  alignHistoryStack(await historyStack, hashState);
}

/**
 * Navigates to the given parameter key and value, preserving the current path.
 * If the value is undefined, the parameter is removed.
 */
export async function navigateToParam(key: string, value?: string) {
  const stack = await historyStack;
  const currentHashState = getHashState(stack.entries[stack.index].url);
  const params = new URLSearchParams(currentHashState.params);
  if (value === undefined) {
    params.delete(key);
  } else {
    params.set(key, value);
  }
  alignHistoryStack(stack, {path: currentHashState.path, params});
}
