import {Fact} from '../facts/Fact';
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
      this.pruneAppliedDisproofs();
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
      this.pruneAppliedDisproofs();
      return true;
    }
    return false;
  }

  clearDeviations() {
    if (this.currentDeviations.length > 0) {
      this.currentDeviations = [];
      this.rebuildGame();
      this.pruneAppliedDisproofs();
    }
  }

  private pruneAppliedDisproofs() {
    const currentEff = this.getEffectiveIndex();
    for (const k of Array.from(this.appliedDisproofsMap.keys())) {
      if (k > currentEff) {
        this.appliedDisproofsMap.delete(k);
      }
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

  private appliedDisproofsMap = new Map<number, Fact[]>();

  getEffectiveIndex(): number {
    return this.currentIndex + this.currentDeviations.length;
  }

  applyDisproof(fact: Fact) {
    const idx = this.getEffectiveIndex();
    let list = this.appliedDisproofsMap.get(idx);
    if (!list) {
      list = [];
      this.appliedDisproofsMap.set(idx, list);
    }
    if (!list.some(f => JSON.stringify(f) === JSON.stringify(fact))) {
      list.push(fact);
    }
  }

  getAppliedDisproofs(): Fact[] {
    const result: Fact[] = [];
    const currentEff = this.getEffectiveIndex();
    for (const [k, list] of this.appliedDisproofsMap.entries()) {
      if (k <= currentEff) {
        result.push(...list);
      }
    }
    return result;
  }

  clearAppliedDisproofs() {
    this.appliedDisproofsMap.clear();
  }
}
