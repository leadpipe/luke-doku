import {PuzzleId, type Sudoku} from '../game/sudoku';
import type {DateString} from '../game/types';
import {ensureExhaustiveSwitch} from '../game/utils';
import {
  FromWorkerMessage,
  FromWorkerMessageType,
  type GeneratePuzzleMessage,
  type PuzzleEvaluatedMessage,
  type PuzzleGeneratedMessage,
  type PuzzleTestedMessage,
  type ToWorkerMessage,
  ToWorkerMessageType,
} from '../worker/worker-types';
import {EventType, logEvent} from './analytics';

interface PendingMessage {
  readonly sent: ToWorkerMessage;
  readonly expectedResponseType: FromWorkerMessageType;
  resolve(result: FromWorkerMessage): void;
  reject(error: string): void;
}

/**
 * A web worker that handles potentially expensive tasks like puzzle generation
 * and evaluation, together with a queue of messages to be sent to it.
 */
class WorkerQueue {
  private readonly pending: PendingMessage[] = [];
  private readonly worker: Worker;
  private static messageCounter = 0;

  constructor() {
    // Webpack recognizes this as a web worker, and will bundle it
    // separately, so that it can be loaded in a web worker context.
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
    worker.onmessage = (e: MessageEvent<FromWorkerMessage>) => {
      if (!this.pending.length) {
        logEvent(EventType.ERROR, {
          category: 'unexpected message from worker',
          detail: JSON.stringify(e),
        });
        return;
      }
      const pending = this.pending.shift();
      this.sendNextRequest();
      if (
        e.data.toWorkerMessage.interactionId !== pending?.sent.interactionId
      ) {
        logEvent(EventType.ERROR, {
          category: 'wrong response received from worker',
          detail: `interaction ID ${e.data.toWorkerMessage.interactionId} instead of ${pending?.sent.interactionId}`,
        });
        // Just returning is the best we could do here, after logging this basically
        // unrecoverable error.
        return;
      }
      if (
        e.data.type !== pending.expectedResponseType &&
        e.data.type !== FromWorkerMessageType.ERROR_CAUGHT
      ) {
        logEvent(EventType.ERROR, {
          category: 'wrong response type received from worker',
          detail: `expected ${pending.expectedResponseType}, got ${e.data.type}`,
        });
        pending.reject(`Unexpected response type ${e.data.type}`);
        return;
      }
      const responseType = e.data.type;
      switch (responseType) {
        case FromWorkerMessageType.ERROR_CAUGHT:
          logEvent(EventType.ERROR, {
            category: `worker error caught: ${e.data.activity}`,
            detail: `${JSON.stringify(pending.sent)}; ${e.data.errorMessage}; ${e.data.stack}`,
          });
          pending.reject(
            e.data.errorMessage || `Error caught in worker: ${e.data.activity}`,
          );
          break;
        case FromWorkerMessageType.PUZZLE_GENERATED:
          const sent = pending.sent as GeneratePuzzleMessage;
          if (e.data.dailySolutionElapsedMs !== undefined) {
            logEvent(EventType.SYSTEM, {
              category: 'worker daily solution generate time',
              detail: sent.date,
              elapsedMs: e.data.dailySolutionElapsedMs,
            });
          }
          const puzzleId = PuzzleId.fromWorker(e.data);
          logEvent(EventType.SYSTEM, {
            category: 'worker puzzle generate time',
            detail: puzzleId.toString(),
            elapsedMs: e.data.elapsedMs,
          });
          logEvent(EventType.SYSTEM, {
            category: 'worker symmetry compute time',
            detail: puzzleId.toString(),
            elapsedMs: e.data.symMatchesElapsedMs,
          });
          pending.resolve(e.data);
          break;
        case FromWorkerMessageType.PUZZLE_EVALUATED:
          logEvent(EventType.SYSTEM, {
            category: 'worker puzzle evaluate time',
            detail: e.data.toWorkerMessage.clues,
            elapsedMs: e.data.elapsedMs,
          });
          pending.resolve(e.data);
          break;
        case FromWorkerMessageType.PUZZLE_TESTED:
          logEvent(EventType.SYSTEM, {
            category: 'worker puzzle test time',
            detail: e.data.toWorkerMessage.clues,
            elapsedMs: e.data.elapsedMs,
          });
          pending.resolve(e.data);
          break;
        default:
          ensureExhaustiveSwitch(responseType);
      }
    };
    this.worker = worker;
  }

  request<T extends ToWorkerMessage>(
    message: Omit<T, 'interactionId'>,
    expectedResponseType: FromWorkerMessageType,
  ): Promise<FromWorkerMessage> {
    return new Promise((resolve, reject) => {
      const sent: T = {
        ...message,
        interactionId: WorkerQueue.messageCounter++,
      } as T;
      this.pending.push({sent, expectedResponseType, resolve, reject});
      if (this.pending.length === 1) {
        this.sendNextRequest();
      }
    });
  }

  private sendNextRequest() {
    if (this.pending.length) {
      const next = this.pending[0];
      this.worker.postMessage(next.sent);
    }
  }
}

const puzzlesQueue = new WorkerQueue();
const evaluateQueue = new WorkerQueue();

/**
 * Sends a message to the worker to generate a puzzle for the given date and
 * counter, and returns a promise that resolves to the generated puzzle.
 * @param date The date for which to generate the puzzle.
 * @param counter The counter identifying the puzzle for the given date.
 * @returns A promise that resolves to the generated puzzle.
 */
export async function requestPuzzleGeneration(
  date: DateString,
  counter: number,
): Promise<PuzzleGeneratedMessage> {
  const message = {
    type: ToWorkerMessageType.GENERATE_PUZZLE,
    date,
    counter,
  };
  return puzzlesQueue.request(
    message,
    FromWorkerMessageType.PUZZLE_GENERATED,
  ) as Promise<PuzzleGeneratedMessage>;
}

/**
 * Sends a message to the worker to evaluate a puzzle, and returns a promise
 * that resolves to the evaluation result.
 * @param sudoku The Sudoku puzzle to evaluate.
 * @returns A promise that resolves to the evaluation result.
 */
export async function requestPuzzleEvaluation(
  sudoku: Sudoku,
): Promise<PuzzleEvaluatedMessage> {
  const message = {
    type: ToWorkerMessageType.EVALUATE_PUZZLE,
    clues: sudoku.cluesString(),
    solutions: sudoku.solutions.map(g => g.toFlatString()),
  };
  return evaluateQueue.request(
    message,
    FromWorkerMessageType.PUZZLE_EVALUATED,
  ) as Promise<PuzzleEvaluatedMessage>;
}

export async function requestPuzzleTesting(
  clues: string,
): Promise<PuzzleTestedMessage> {
  const message = {
    type: ToWorkerMessageType.TEST_PUZZLE,
    clues,
  };
  return puzzlesQueue.request(
    message,
    FromWorkerMessageType.PUZZLE_TESTED,
  ) as Promise<PuzzleTestedMessage>;
}
