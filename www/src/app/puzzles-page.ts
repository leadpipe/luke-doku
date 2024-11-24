import './events';

import {css, html, LitElement, PropertyValues} from 'lit';
import {customElement, property, state} from 'lit/decorators.js';
import * as wasm from 'luke-doku-rust';
import {Sudoku} from '../game/sudoku';
import {customEvent} from './events';

@customElement('puzzles-page')
export class PuzzlesPage extends LitElement {
  static override styles = css`
    :host {
      display: flex;
      flex-direction: column;
      margin: auto;
    }
    table {
      margin: auto;
    }
    th {
      text-align: right;
      padding-right: 8px;
      white-space: nowrap;
    }
  `;

  override render() {
    return html`
      <table>
        <tr>
          <th>date</th>
          <td>
            <input
              type="text"
              value=${this.dateString}
              @change=${this.changeDate}
            />
          </td>
        </tr>
        <tr>
          <th>counter</th>
          <td>
            <input
              type="number"
              value=${this.counter}
              @change=${this.changeCounter}
            />
          </td>
        </tr>
        ${this.puzzleDesc
          ? html`
              <tr>
                <th>clues</th>
                <td>${this.puzzleDesc.clues.len()}</td>
              </tr>
              <tr>
                <th>solutions</th>
                <td>${this.puzzleDesc.solutions.length}</td>
              </tr>
              ${this.puzzleDesc.gen_opts
                ? html`
                    <tr>
                      <th>date</th>
                      <td>${this.puzzleDesc.gen_opts.daily_solution.date}</td>
                    </tr>
                    <tr>
                      <th>counter</th>
                      <td>${this.puzzleDesc.gen_opts.counter}</td>
                    </tr>
                    <tr>
                      <th>symmetry</th>
                      <td>${wasm.Sym[this.puzzleDesc.gen_opts.sym]}</td>
                    </tr>
                    <tr>
                      <th>broken ok</th>
                      <td>${this.puzzleDesc.gen_opts.broken}</td>
                    </tr>
                    <tr>
                      <th>improper ok</th>
                      <td>${this.puzzleDesc.gen_opts.improper}</td>
                    </tr>
                  `
                : html``}
            `
          : html` (illegal date or counter) `}
      </table>
      ${this.puzzleDesc
        ? html` <button @click=${this.selectPuzzle}>Select puzzle</button> `
        : html``}
    `;
  }

  override firstUpdated(_changedProperties: PropertyValues) {
    this.updateDailySolution();
  }

  @property() dateString = wasm.LogicalDate.fromDate(new Date()).toString();
  @property({type: Number}) counter = 1;

  @state() private dailySolution?: wasm.DailySolution;
  @state() private puzzleDesc?: wasm.Puzzle;

  changeDate(event: Event) {
    this.dateString = (event.target as HTMLInputElement).value;
    this.updateDailySolution();
  }

  private updateDailySolution() {
    this.dailySolution?.free();
    try {
      const date = wasm.LogicalDate.fromString(this.dateString);
      this.dailySolution = wasm.dailySolution(date);
    } catch {
      this.dailySolution = undefined;
    }
    this.updatePuzzleDesc();
  }

  changeCounter(event: Event) {
    this.counter = Number((event.target as HTMLInputElement).value);
    this.updatePuzzleDesc();
  }

  private updatePuzzleDesc() {
    const puzzleDesc = this.dailySolution?.gen(this.counter);
    if (puzzleDesc) {
      if (this.puzzleDesc) {
        this.puzzleDesc.free();
      }
      this.puzzleDesc = puzzleDesc;
    }
  }

  selectPuzzle(event_: Event) {
    const {puzzleDesc} = this;
    if (puzzleDesc) {
      this.dispatchEvent(
        customEvent('play-puzzle', {
          detail: Sudoku.fromWasm(puzzleDesc),
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
