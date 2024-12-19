import './events';

import {css, html, LitElement} from 'lit';
import {customElement, state} from 'lit/decorators.js';
import * as wasm from 'luke-doku-rust';
import {openDb} from '../game/database';
import {Game} from '../game/game';
import {Sudoku} from '../game/sudoku';
import {GridString} from '../game/types';
import {customEvent} from './events';
import {LOGO_FONT_FAMILY} from './styles';
import {findDataString} from './utils';

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
      <h2>Today&apos;s puzzles</h2>
      <div class="puzzle-list">
        ${this.todaysGames.map(
          game => html`
            <div
              class="puzzle"
              @click=${this.selectPuzzle}
              data-clues=${game.sudoku.cluesString() as string}
            >
              <sudoku-view .game=${game}></sudoku-view>
              #${game.sudoku.id?.counter}
            </div>
          `,
        )}
      </div>
    `;
  }

  @state() private todaysGames: Game[] = [];

  constructor() {
    super();
    this.loadPuzzles();
  }

  private async loadPuzzles() {
    const todaysGames = [];
    const db = await openDb();
    const today = wasm.LogicalDate.fromDate(new Date());
    const todayString = today.toString();
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
    this.todaysGames = todaysGames;
    if (todaysGames.length >= 10) return;
    const dailySolution = wasm.dailySolution(today);
    for (let counter = todaysGames.length + 1; counter <= 10; ++counter) {
      const sudoku = await this.generatePuzzle(dailySolution, counter);
      const record = sudoku.toDatabaseRecord();
      await db.add('puzzles', record);
      todaysGames.push(Game.forDbRecord(db, record));
      this.todaysGames = [...todaysGames];
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
