import './events';

import {css, html, LitElement} from 'lit';
import {customElement} from 'lit/decorators.js';
import * as wasm from 'luke-doku-rust';
import {Game} from '../game/game';
import {Sudoku} from '../game/sudoku';
import {customEvent} from './events';
import {CluesString} from 'src/game/types';
import { findDataString } from './utils';

@customElement('puzzles-page')
export class PuzzlesPage extends LitElement {
  static override styles = css`
    :host {
      display: block;
      margin: 0 20px;
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
        ${this.puzzles.map(
          sudoku => html`
            <div
              class="puzzle"
              @click=${this.selectPuzzle}
              data-clues=${sudoku.cluesString() as string}
            >
              <sudoku-view .game=${new Game(sudoku)}></sudoku-view>
              #${sudoku.id?.counter}
            </div>
          `,
        )}
      </div>
    `;
  }

  private readonly puzzles: Sudoku[];
  private readonly puzzlesByCluesString: Map<CluesString, Sudoku>;

  constructor() {
    super();
    const date = wasm.LogicalDate.fromDate(new Date());
    const dailySolution = wasm.dailySolution(date);
    const puzzles: Sudoku[] = [];
    const puzzlesByCluesString = new Map<CluesString, Sudoku>();
    for (let counter = 1; counter <= 10; ++counter) {
      const sudoku = Sudoku.fromWasm(dailySolution.gen(counter));
      puzzles.push(sudoku);
      puzzlesByCluesString.set(sudoku.cluesString(), sudoku);
    }
    this.puzzles = puzzles;
    this.puzzlesByCluesString = puzzlesByCluesString;
  }

  private selectPuzzle(event: Event) {
    const {puzzlesByCluesString} = this;
    const cluesString = findDataString(event, 'clues') as CluesString;
    const puzzle = puzzlesByCluesString.get(cluesString);
    if (puzzle) {
      this.dispatchEvent(
        customEvent('play-puzzle', {
          detail: puzzle,
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
