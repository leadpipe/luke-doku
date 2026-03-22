// Browser navigation module.

import {PuzzleId, type Sudoku} from '../game/sudoku';
import {EventType, log, logEvent} from '../system/analytics';
import {dispatchTypeSafeEvent} from './events';
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
  const pathname = hashUrl.pathname.substring(1);
  const path = pathname ? pathname.split('/') : [];
  return {
    path,
    params: hashUrl.searchParams,
  };
}

function getUrl(hashState: HashState): string {
  const hashPath = hashState.path.join('/');
  const search = hashState.params.toString();
  if (!hashPath && !search) {
    return baseUrl;
  }
  return baseUrl + '#' + hashPath + (search ? '?' + search : '');
}

/** The path component for entering a custom puzzle. */
export const ENTER_PUZZLE_PATH = 'enter-puzzle';

/** The set of URL parameters that produce separate history entries. */
const PUSHED_PARAMS = new Set(['d']); // dialog

/**
 * Returns all prefix URLs for the given hash state, starting from the base URL,
 * through all the path components, and finally including the parameters. The
 * last URL is the full URL for the given hash state, and each preceding URL is
 * a prefix of it.
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
  const pushedParams = new URLSearchParams();
  for (const [key, value] of hashState.params) {
    if (PUSHED_PARAMS.has(key)) {
      pushedParams.append(key, value);
    } else {
      params.append(key, value);
    }
  }
  if (params.size) {
    urls.pop(); // remove the full path URL, since the params will be different
    urls.push(getUrl({path, params}));
  }
  if (pushedParams.size) {
    for (const [key, value] of pushedParams) {
      params.append(key, value);
    }
    urls.push(getUrl({path, params}));
  }
  return urls;
}

export const TEST_ONLY = {
  getPrefixUrls,
};

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
    if (path[0] === ENTER_PUZZLE_PATH) {
      return 'Enter a Puzzle';
    }
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
  const hashState = getHashState(url);
  document.title = getDocumentTitle(hashState);
  const pushed = pushOrReplace(entries, index, url);
  if (pushed) {
    window.history.pushState({index}, '', url);
    log('PUSH', index, url);
  } else {
    window.history.replaceState({index}, '', url);
    log('REPLACE', index, url);
  }
}

/**
 * Aligns the given history stack with the given hash state by pushing,
 * replacing, or going back as needed.
 */
async function alignHistoryStack(
  stack: HistoryStack,
  hashState: HashState,
  sendEvent = true,
) {
  const prefixUrls = getPrefixUrls(hashState);
  log('Aligning history stack with hash state', hashState, prefixUrls, stack);

  // Find the first entry that differs from the implied history stack.
  let i = 0;
  for (; i < prefixUrls.length; ++i) {
    const url = prefixUrls[i];
    if (stack.entries[i]?.url !== url) {
      // Note this handles a short stack
      break;
    }
  }
  // The general approach is to jump forward or back, replace the first
  // differing entry, and then push the rest of the entries.  However, if the
  // new stack is shorter, we may need to jump to the last identical entry so
  // there is something to push.
  if (
    i === stack.entries.length ||
    i === prefixUrls.length ||
    (i > 0 && i < stack.entries.length && i < prefixUrls.length - 1)
  ) {
    --i;
  }

  await go(i - stack.index);
  stack.index = i;

  // If we need to push new entries, first trim the array.
  if (i + 1 < prefixUrls.length) {
    stack.entries = stack.entries.slice(0, i + 1);
  }
  for (; i < prefixUrls.length; ++i) {
    const url = prefixUrls[i];
    updateEntriesAndTitle(stack.entries, i, url);
    stack.index = i;
  }
  window.sessionStorage.setItem('historyStack', JSON.stringify(stack));
  if (sendEvent) handleHashStateChange({index: stack.index});
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
  await alignHistoryStack(stack, getHashState(fullUrl), false);
  return stack;
})();

let popstateResolver: ((value: void | PromiseLike<void>) => void) | null = null;

window.addEventListener('popstate', async event => {
  if (popstateResolver) {
    popstateResolver();
    popstateResolver = null;
    log('POPSTATE (awaited)', window.location.hash);
  } else {
    log('POPSTATE', window.location.hash);
    await handleHashStateChange(event.state || {});
  }
});

/**
 * Goes forward or backward in the history stack, waiting until the popstate
 * event is handled (or too much time has elapsed).
 */
async function go(delta: number): Promise<void> {
  if (delta === 0) {
    log('GO', delta, '(no-op)');
    return;
  }
  const o = Promise.withResolvers<void>();
  popstateResolver = o.resolve;
  window.history.go(delta);
  log('GO', delta);
  await Promise.race([
    o.promise,
    new Promise<void>(resolve =>
      setTimeout(() => {
        if (popstateResolver === o.resolve) {
          popstateResolver = null;
          logEvent(EventType.ERROR, {
            category: 'history.go timeout',
            detail: `delta=${delta}`,
          });
        }
        resolve();
      }, 100),
    ),
  ]);
}

async function handleHashStateChange({index: stateIndex}: {index?: number}) {
  const stack = await historyStack;
  const fullUrl = window.location.href;
  const hashState = getHashState(fullUrl);
  const index = stack.entries.findIndex(entry => entry.url === fullUrl);
  if (index >= 0) {
    stack.index = index;
    window.sessionStorage.setItem('historyStack', JSON.stringify(stack));
  } else {
    // The current URL is not in our history stack; rebuild the stack.
    if (stateIndex != null) {
      logEvent(EventType.ACTION, {
        category: 'user changed address bar',
        detail: `${fullUrl} (${stateIndex})`,
      });
    } else {
      logEvent(EventType.ERROR, {
        category: 'history stack missing entry',
        detail: fullUrl,
      });
    }
    // Adjusts the stack to our best guess of the new history stack.
    ++stack.index;
    stack.entries.splice(stack.index, stack.entries.length - stack.index, {
      index: stack.index,
      url: fullUrl,
    });
    await alignHistoryStack(stack, hashState, false);
  }
  dispatchTypeSafeEvent(window, 'hash-state-changed', hashState);
}

/**
 * Navigates to the base URL, which shows the puzzles page.  This consists of
 * going back in history to the original page.
 */
export async function navigateHome() {
  return navigateToPath(); // empty path == home
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
  await alignHistoryStack(await historyStack, hashState);
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
  await alignHistoryStack(stack, {path: currentHashState.path, params});
}

/**
 * Navigates to the given puzzle's solve page.
 */
export async function navigateToPuzzle(sudoku: Sudoku) {
  await navigateToPath(sudoku.id ? sudoku.id.toString() : sudoku.cluesString());
}
