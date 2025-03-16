import type {DateString} from '../game/types';
import {
  FromWorkerMessage,
  FromWorkerMessageType,
  type GeneratePuzzleMessage,
  type PuzzleGeneratedMessage,
  ToWorkerMessageType,
} from '../worker/worker-types';
import {EventType, logEvent} from './analytics';

/**
 * The web worker that generates puzzles.  Note that webpack sees this code and
 * handles it specially.
 */
const worker = new Worker(
  /* webpackChunkName: 'worker' */ new URL(
    '../bootstrap-worker.js',
    import.meta.url,
  ),
  {name: 'worker'},
);
worker.onerror = (e: ErrorEvent) => {
  logEvent(EventType.ERROR, {
    category: 'uncaught worker error',
    detail: String(e),
  });
};
interface PendingPuzzle {
  readonly sent: GeneratePuzzleMessage;
  resolve(result: PuzzleGeneratedMessage): void;
  reject(error: string): void;
}
const pendingPuzzles: PendingPuzzle[] = [];
worker.onmessage = (e: MessageEvent<FromWorkerMessage>) => {
  if (!pendingPuzzles.length) {
    logEvent(EventType.ERROR, {
      category: 'unexpected message from worker',
      detail: JSON.stringify(e),
    });
    return;
  }
  const pendingPuzzle = pendingPuzzles.shift();
  sendNextRequest();
  const sent = e.data.toWorkerMessage;
  if (
    sent.date !== pendingPuzzle?.sent.date ||
    sent.counter !== pendingPuzzle.sent.counter
  ) {
    logEvent(EventType.ERROR, {
      category: 'wrong puzzle received from worker',
      detail: `${JSON.stringify(sent)} instead of ${JSON.stringify(
        pendingPuzzle?.sent,
      )}`,
    });
    // Just returning is the best we could do here, after logging this basically
    // unrecoverable error.
    return;
  }
  const puzzleId = `${sent.date}:${sent.counter}`;
  switch (e.data.type) {
    case FromWorkerMessageType.ERROR_CAUGHT:
      logEvent(EventType.ERROR, {
        category: `worker error caught: ${e.data.activity}`,
        detail: `${puzzleId}; ${e.data.errorMessage}; ${e.data.stack}`,
      });
      pendingPuzzle.reject(`Unable to generate puzzle ${puzzleId}`);
      break;
    case FromWorkerMessageType.PUZZLE_GENERATED:
      if (e.data.dailySolutionElapsedMs !== undefined) {
        logEvent(EventType.SYSTEM, {
          category: 'worker daily solution generate time',
          detail: sent.date,
          elapsedMs: e.data.dailySolutionElapsedMs,
        });
      }
      logEvent(EventType.SYSTEM, {
        category: 'worker puzzle generate time',
        detail: puzzleId,
        elapsedMs: e.data.elapsedMs,
      });
      logEvent(EventType.SYSTEM, {
        category: 'worker symmetry compute time',
        detail: puzzleId,
        elapsedMs: e.data.elapsedMs,
      });
      pendingPuzzle.resolve(e.data);
      break;
  }
};

export function requestPuzzle(
  date: DateString,
  counter: number,
): Promise<PuzzleGeneratedMessage> {
  return new Promise((resolve, reject) => {
    pendingPuzzles.push({
      sent: {type: ToWorkerMessageType.GENERATE_PUZZLE, date, counter},
      resolve,
      reject,
    });
    if (pendingPuzzles.length === 1) {
      sendNextRequest();
    }
  });
}

function sendNextRequest() {
  if (pendingPuzzles.length) {
    worker.postMessage(pendingPuzzles[0].sent);
  }
}
