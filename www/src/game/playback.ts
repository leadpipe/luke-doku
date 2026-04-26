import {BaseGame, type GameWrapper} from './game';
import {RecordedCommand} from './command';
import {Sudoku} from './sudoku';

export class PlaybackGame {
  private baseGame: BaseGame;
  private readonly sudoku: Sudoku;
  public readonly history: readonly RecordedCommand[];
  private currentIndex: number;
  private gameWrapper: GameWrapper;

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
    if (i !== this.currentIndex) {
      this.baseGame = new BaseGame(this.sudoku, this.history.slice(0, i));
      this.currentIndex = i;
      this.gameWrapper = {game: this.baseGame};
    }
  }

  get currentCommand(): RecordedCommand | undefined {
    if (this.currentIndex === 0) return undefined;
    return this.history[this.currentIndex - 1];
  }
}
