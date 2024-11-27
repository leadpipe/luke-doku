import './events';
import './puzzles-page';
import './solve-page';
import './sudoku-view';

import {css, html, LitElement, TemplateResult} from 'lit';
import {customElement, property, state} from 'lit/decorators.js';
import {Sudoku} from '../game/sudoku';
import {ensureExhaustiveSwitch} from '../game/utils';

type Page = 'solve' | 'puzzles';

/** Top-level component. */
@customElement('luke-doku')
export class LukeDoku extends LitElement {
  static override styles = css`
    :host {
      display: block;
    }

    solve-page {
      margin: auto;
    }
  `;

  override render() {
    return this.renderPage(this.page);
  }

  private renderPage(page: Page): TemplateResult {
    switch (page) {
      case 'solve':
        return html` <solve-page .sudoku=${this.sudoku}></solve-page> `;
      case 'puzzles':
        return html` <puzzles-page></puzzles-page> `;
      default:
        ensureExhaustiveSwitch(page);
    }
  }

  @state() private sudoku: Sudoku | null = null;
  @state() page: Page = 'puzzles';

  constructor() {
    super();
    this.addEventListener('play-puzzle', e => this.selectPuzzle(e));
    this.addEventListener('show-puzzles-page', () => this.showPuzzlesPage());
  }

  private selectPuzzle(event: CustomEvent<Sudoku>) {
    this.sudoku = event.detail;
    this.page = 'solve';
  }

  private showPuzzlesPage() {
    this.page = 'puzzles';
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'luke-doku': LukeDoku;
  }
}
