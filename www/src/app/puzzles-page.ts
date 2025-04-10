import './events';

import type {IDBPDatabase} from 'idb';
import {css, html, LitElement} from 'lit';
import {customElement, queryAll, state} from 'lit/decorators.js';
import {repeat} from 'lit/directives/repeat.js';
import {Game, PlayState} from '../game/game';
import {GridString} from '../game/types';
import {
  iterateCompletedPuzzlesDesc,
  iterateOngoingPuzzlesDesc,
  iterateUnstartedPuzzlesAsc,
  type LukeDokuDb,
  openDb,
} from '../system/database';
import {customEvent} from './events';
import {LOGO_FONT_FAMILY} from './styles';
import type {SudokuView} from './sudoku-view';
import {
  elapsedTimeString,
  findDataString,
  renderCompletedGameDescription,
  renderPuzzleTitle,
  todayString,
} from './utils';

@customElement('puzzles-page')
export class PuzzlesPage extends LitElement {
  static override styles = css`
    :host {
      display: block;
      & > * {
        margin: 20px;
      }
    }
    h1 {
      font-family: ${LOGO_FONT_FAMILY};
      font-size: 48px;
    }
    .puzzle-list {
      display: flex;
      gap: 16px;
      overflow-x: scroll;
    }
    .puzzle-grid {
      display: flex;
      flex-wrap: wrap;
      gap: 16px;
      overflow-y: scroll;
    }
    .puzzle {
      text-align: center;
      cursor: pointer;
      width: min-content;
    }
    sudoku-view {
      width: 144px;
      height: 144px;
      margin-bottom: 4px;
    }
  `;

  override render() {
    return html`
      <h1>Luke-doku</h1>
      ${this.ongoingGames.length > 0 ?
        html`
          <h2>Ongoing</h2>
          <div class="puzzle-list">
            ${this.renderPuzzles(this.ongoingGames)}
          </div>
        `
      : ''}
      <h2>Today&apos;s puzzles</h2>
      <div class="puzzle-list">
        ${this.renderPuzzles(this.todaysGames, /*assumeToday=*/ true)}
        <div>
          <button @click=${this.generateMore}>Make more</button>
        </div>
      </div>
      ${this.recentlyCompletedGames.length > 0 ?
        html`
          <h2>Recently completed</h2>
          <div id="completed" class="puzzle-grid">
            ${this.renderPuzzles(this.recentlyCompletedGames)}
            ${this.moreCompletedGames ?
              html`
                <div>
                  <button @click=${this.loadMoreCompletedPuzzles}>
                    Load more
                  </button>
                </div>
              `
            : ''}
          </div>
        `
      : ''}
    `;
  }

  private renderPuzzles(list: readonly Game[], assumeToday = false) {
    return html`
      ${repeat(
        list,
        game => game.sudoku.cluesString(),
        game => html`
          <div
            class="puzzle"
            @click=${this.selectPuzzle}
            data-clues=${game.sudoku.cluesString() as string}
          >
            <sudoku-view .gameWrapper=${game.wrapper}></sudoku-view>
            <div class="description">
              ${this.renderPuzzleDescription(game, assumeToday)}
            </div>
          </div>
        `,
      )}
    `;
  }

  private renderPuzzleDescription(game: Game, assumeToday: boolean) {
    const parts = [renderPuzzleTitle(game.sudoku, assumeToday)];
    switch (game.playState) {
      case PlayState.UNSTARTED:
        break;
      case PlayState.COMPLETED:
        parts.push(...renderCompletedGameDescription(game));
        break;
      default:
        parts.push(html`<div>${elapsedTimeString(game.elapsedMs)}</div>`);
        break;
    }
    return parts;
  }

  @state() private ongoingGames: Game[] = [];
  @state() private todaysGames: Game[] = [];
  private topCounter = 0;
  @state() private recentlyCompletedGames: Game[] = [];
  @state() private moreCompletedGames = false;
  @queryAll('#completed sudoku-view')
  private completedSudokuViews?: NodeListOf<SudokuView>;

  constructor() {
    super();
    this.loadPuzzles();
  }

  private async loadPuzzles() {
    const db = await openDb();
    this.cleanOldUnstartedPuzzles(db);
    this.loadOngoingPuzzles(db);
    this.loadRecentlyCompletedPuzzles(db);
    await this.loadTodaysPuzzles(db);
    this.generateTodaysPuzzles(db, 10);
  }

  private async loadTodaysPuzzles(db: IDBPDatabase<LukeDokuDb>) {
    const a = this.todaysGames;
    const b = [...a];
    const index = db.transaction('puzzles').store.index('byPuzzleId');
    for await (const cursor of index.iterate(
      // Puzzle IDs in the db are `[date, counter]`, so this gets all of today's
      // puzzles that are in the DB (starting at 1).
      IDBKeyRange.bound([todayString, 1], [todayString, Infinity]),
    )) {
      const game = Game.forDbRecord(db, cursor.value);
      a.push(game);
      b.push(game);
      this.todaysGames = this.todaysGames === a ? b : a;
      this.topCounter = game.sudoku.id!.counter;
    }
  }

  private async generateTodaysPuzzles(
    db: IDBPDatabase<LukeDokuDb>,
    totalCount: number,
  ) {
    const a = this.todaysGames;
    const b = [...a];
    for (let counter = 1, index = 0; counter <= totalCount; ++counter) {
      if (a[index] && a[index].sudoku.id?.counter === counter) {
        ++index;
        continue;
      }
      const game = await Game.createGame(db, todayString, counter);
      a.splice(counter - 1, 0, game);
      b.splice(counter - 1, 0, game);
      ++index;
      this.todaysGames = this.todaysGames === a ? b : a;
    }
    this.topCounter = Math.max(this.topCounter, totalCount);
  }

  private async loadOngoingPuzzles(db: IDBPDatabase<LukeDokuDb>) {
    const a = this.ongoingGames;
    const b = [...a];
    for await (const cursor of iterateOngoingPuzzlesDesc(db)) {
      const game = Game.forDbRecord(db, cursor.value);
      a.push(game);
      b.push(game);
      this.ongoingGames = this.ongoingGames === a ? b : a;
    }
  }

  private async loadRecentlyCompletedPuzzles(
    db: IDBPDatabase<LukeDokuDb>,
    maxCount = 10,
  ) {
    this.moreCompletedGames = false;
    const firstSudokuView = this.completedSudokuViews?.[0];
    const a = this.recentlyCompletedGames;
    const b = [...a];
    let i = 0;
    for await (const cursor of iterateCompletedPuzzlesDesc(db)) {
      if (a.length >= maxCount) {
        this.moreCompletedGames = true;
        break;
      }
      if (i < a.length) {
        if (a[i++].sudoku.cluesString() === cursor.value.clues) {
          continue;
        }
        a.splice(i);
        b.splice(i);
      }
      const game = Game.forDbRecord(db, cursor.value);
      a.push(game);
      b.push(game);
      this.recentlyCompletedGames = this.recentlyCompletedGames === a ? b : a;
      if (firstSudokuView) {
        await this.updateComplete;
        const newSudokuView = this.completedSudokuViews?.[a.length - 1];
        if (newSudokuView) {
          newSudokuView.animationTime = firstSudokuView.animationTime;
        }
      }
    }
  }

  private async loadMoreCompletedPuzzles() {
    const db = await openDb();
    await this.loadRecentlyCompletedPuzzles(
      db,
      this.recentlyCompletedGames.length + 10,
    );
  }

  private async cleanOldUnstartedPuzzles(db: IDBPDatabase<LukeDokuDb>) {
    const toDelete = [];
    for await (const cursor of iterateUnstartedPuzzlesAsc(db)) {
      if ((cursor.value.puzzleId?.[0] ?? todayString) >= todayString) {
        continue;
      }
      toDelete.push(cursor.primaryKey);
    }
    for (const cluesString of toDelete) {
      await db.delete('puzzles', cluesString);
    }
  }

  private selectPuzzle(event: Event) {
    const cluesString = findDataString(event, 'clues') as GridString;
    const game = Game.forCluesString(cluesString);
    if (game) {
      this.dispatchEvent(
        customEvent('play-puzzle', {
          detail: game,
          bubbles: true,
          composed: true,
        }),
      );
    }
  }

  private async generateMore() {
    const db = await openDb();
    await this.generateTodaysPuzzles(db, this.topCounter + 10);
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'puzzles-page': PuzzlesPage;
  }
}
