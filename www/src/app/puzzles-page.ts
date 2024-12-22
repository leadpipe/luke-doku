import './events';

import type {IDBPDatabase} from 'idb';
import {css, html, LitElement} from 'lit';
import {customElement, state} from 'lit/decorators.js';
import {repeat} from 'lit/directives/repeat.js';
import * as wasm from 'luke-doku-rust';
import {AttemptState, type LukeDokuDb, openDb} from '../game/database';
import {Game} from '../game/game';
import {Sudoku} from '../game/sudoku';
import {GridString} from '../game/types';
import {customEvent} from './events';
import {LOGO_FONT_FAMILY} from './styles';
import {findDataString} from './utils';

const DATE_BOUND = 8640000000000000;

@customElement('puzzles-page')
export class PuzzlesPage extends LitElement {
  static override styles = css`
    :host {
      display: block;
      margin: 0 20px;
    }
    h1 {
      font-family: ${LOGO_FONT_FAMILY};
      font-size: 48px;
    }
    .puzzle-list {
      display: flex;
      gap: 16px;
      overflow-x: scroll;
      .puzzle {
        text-align: center;
        cursor: pointer;
      }
      sudoku-view {
        width: 100px;
        height: 100px;
        margin-bottom: 4px;
      }
    }
  `;

  override render() {
    return html`
      <h1>Luke-doku</h1>
      ${this.ongoingGames.length > 0 ?
        html`
          <h2>Ongoing</h2>
          ${this.renderPuzzleList(this.ongoingGames)}
        `
      : ''}
      <h2>Today&apos;s puzzles</h2>
      ${this.renderPuzzleList(this.todaysGames)}
      ${this.recentlyCompletedGames.length > 0 ?
        html`
          <h2>Recently completed</h2>
          ${this.renderPuzzleList(this.recentlyCompletedGames)}
        `
      : ''}
    `;
  }

  private renderPuzzleList(list: readonly Game[]) {
    const {todayString} = this;
    return html`
      <div class="puzzle-list">
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
              ${(game.sudoku.id?.date ?? todayString) === todayString ?
                ''
              : game.sudoku.id?.date}
              #${game.sudoku.id?.counter} ${game.playState}, ${game.elapsedMs}
              ms
            </div>
          `,
        )}
      </div>
    `;
  }

  private readonly today = wasm.LogicalDate.fromDate(new Date());
  private readonly todayString = this.today.toString();
  @state() private ongoingGames: Game[] = [];
  @state() private todaysGames: Game[] = [];
  @state() private recentlyCompletedGames: Game[] = [];

  constructor() {
    super();
    this.loadPuzzles();
  }

  private async loadPuzzles() {
    const db = await openDb();
    this.cleanOldUnstartedPuzzles(db);
    const [todaysGames, ongoingGames, recentlyCompletedGames] =
      await Promise.all([
        this.loadTodaysPuzzles(db),
        this.loadOngoingPuzzles(db),
        this.loadRecentlyCompletedPuzzles(db),
      ]);
    this.todaysGames = todaysGames;
    this.ongoingGames = ongoingGames;
    this.recentlyCompletedGames = recentlyCompletedGames;
    this.generateTodaysPuzzles(db, 10);
  }

  private async loadTodaysPuzzles(
    db: IDBPDatabase<LukeDokuDb>,
  ): Promise<Game[]> {
    const todaysGames = [];
    const {today, todayString} = this;
    const index = db.transaction('puzzles').store.index('byPuzzleId');
    for await (const cursor of index.iterate(
      // Puzzle IDs in the db are `${date}:${counter}`, and semicolon is the
      // next character after colon, so this gets all of today's puzzles that
      // are in the DB.
      IDBKeyRange.bound(todayString + ':', todayString + ';'),
    )) {
      todaysGames.push(Game.forDbRecord(db, cursor.value));
    }
    todaysGames.sort(
      (a, b) => (a.sudoku.id?.counter ?? 0) - (b.sudoku.id?.counter ?? 0),
    );
    return todaysGames;
  }

  private async generateTodaysPuzzles(
    db: IDBPDatabase<LukeDokuDb>,
    totalCount: number,
  ) {
    const {todaysGames, today} = this;
    if (todaysGames.length >= totalCount) return;
    const dailySolution = wasm.dailySolution(today);
    for (let counter = 1; counter <= totalCount; ++counter) {
      const sudoku = await this.generatePuzzle(dailySolution, counter);
      if (Game.forCluesString(sudoku.cluesString())) continue;
      const record = sudoku.toDatabaseRecord();
      await db.add('puzzles', record);
      todaysGames.splice(counter - 1, 0, Game.forDbRecord(db, record));
      this.todaysGames = [...todaysGames];
    }
  }

  private async loadOngoingPuzzles(
    db: IDBPDatabase<LukeDokuDb>,
  ): Promise<Game[]> {
    const ongoingGames = [];
    const index = db.transaction('puzzles').store.index('byStateAndDate');
    for await (const cursor of index.iterate(
      IDBKeyRange.bound(
        [AttemptState.ONGOING, new Date(-DATE_BOUND)],
        [AttemptState.ONGOING, new Date(DATE_BOUND)],
      ),
      'prev',
    )) {
      ongoingGames.push(Game.forDbRecord(db, cursor.value));
    }
    return ongoingGames;
  }

  private async loadRecentlyCompletedPuzzles(
    db: IDBPDatabase<LukeDokuDb>,
  ): Promise<Game[]> {
    const recentlyCompletedGames = [];
    const index = db.transaction('puzzles').store.index('byStateAndDate');
    for await (const cursor of index.iterate(
      IDBKeyRange.bound(
        [AttemptState.COMPLETED, new Date(-DATE_BOUND)],
        [AttemptState.COMPLETED, new Date(DATE_BOUND)],
      ),
      'prev',
    )) {
      recentlyCompletedGames.push(Game.forDbRecord(db, cursor.value));
      if (recentlyCompletedGames.length >= 10) break;
    }
    return recentlyCompletedGames;
  }

  private async cleanOldUnstartedPuzzles(db: IDBPDatabase<LukeDokuDb>) {
    const toDelete = [];
    const index = db.transaction('puzzles').store.index('byStateAndDate');
    for await (const cursor of index.iterate(
      IDBKeyRange.bound(
        [AttemptState.UNSTARTED, new Date(-DATE_BOUND)],
        [AttemptState.UNSTARTED, this.today.toDateAtMidnight()],
        false,
        true,
      ),
    )) {
      toDelete.push(cursor.primaryKey);
    }
    for (const cluesString of toDelete) {
      await db.delete('puzzles', cluesString);
    }
  }

  private async generatePuzzle(
    dailySolution: wasm.DailySolution,
    counter: number,
  ): Promise<Sudoku> {
    // Eventually this will be a call to a worker thread.
    return Sudoku.fromWasm(dailySolution.gen(counter));
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
}

declare global {
  interface HTMLElementTagNameMap {
    'puzzles-page': PuzzlesPage;
  }
}
