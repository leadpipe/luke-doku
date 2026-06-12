import {Command, RecordedCommand} from './command';
import {BaseGame, type GameWrapper} from './game';
import {Sudoku} from './sudoku';

export class PlaybackGame {
  private baseGame: BaseGame;
  private readonly sudoku: Sudoku;
  public readonly history: readonly RecordedCommand[];
  private currentIndex: number;
  private gameWrapper: GameWrapper;
  private currentDeviations: RecordedCommand[] = [];

  constructor(sudoku: Sudoku, history: readonly RecordedCommand[]) {
    this.sudoku = sudoku;
    this.history = history;
    this.currentIndex = history.length;
    this.baseGame = new BaseGame(sudoku, history);
    this.gameWrapper = {game: this.baseGame};
  }

  get wrapper(): GameWrapper {
    return this.gameWrapper;
  }

  get index(): number {
    return this.currentIndex;
  }

  set index(i: number) {
    i = Math.max(0, Math.min(this.history.length, i));
    if (i !== this.currentIndex || this.currentDeviations.length > 0) {
      this.currentDeviations = [];
      this.currentIndex = i;
      this.rebuildGame();
    }
  }

  get deviations(): readonly RecordedCommand[] {
    return this.currentDeviations;
  }

  addDeviation(command: Command) {
    const lastTimestamp =
      this.currentDeviations.length > 0 ?
        this.currentDeviations[this.currentDeviations.length - 1]
          .elapsedTimestamp
      : this.currentIndex > 0 ?
        this.history[this.currentIndex - 1].elapsedTimestamp
      : 0;

    this.currentDeviations.push({
      command,
      elapsedTimestamp: lastTimestamp + 1000,
    });
    this.rebuildGame();
  }

  popDeviation(): boolean {
    if (this.currentDeviations.length > 0) {
      this.currentDeviations.pop();
      this.rebuildGame();
      return true;
    }
    return false;
  }

  clearDeviations() {
    if (this.currentDeviations.length > 0) {
      this.currentDeviations = [];
      this.rebuildGame();
    }
  }

  private rebuildGame() {
    this.baseGame = new BaseGame(this.sudoku, [
      ...this.history.slice(0, this.currentIndex),
      ...this.currentDeviations,
    ]);
    this.gameWrapper = {game: this.baseGame};
  }

  get currentCommand(): RecordedCommand | undefined {
    if (this.currentDeviations.length > 0) {
      return this.currentDeviations[this.currentDeviations.length - 1];
    }
    if (this.currentIndex === 0) return undefined;
    return this.history[this.currentIndex - 1];
  }
}
