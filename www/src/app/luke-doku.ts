import './events';
import './puzzles-page';
import './solve-page';
import './sudoku-view';

import {css, html, LitElement, TemplateResult} from 'lit';
import {customElement, state} from 'lit/decorators.js';
import type {Game} from '../game/game';
import {ensureExhaustiveSwitch} from '../game/utils';

type Page = 'solve' | 'puzzles';

/** Top-level component. */
@customElement('luke-doku')
export class LukeDoku extends LitElement {
  static override styles = css`
    :host {
      display: block;
    }
  `;

  override render() {
    return this.renderPage(this.page);
  }

  private renderPage(page: Page): TemplateResult {
    switch (page) {
      case 'solve':
        return html` <solve-page .game=${this.game}></solve-page> `;
      case 'puzzles':
        return html` <puzzles-page></puzzles-page> `;
      default:
        ensureExhaustiveSwitch(page);
    }
  }

  @state() private game: Game | null = null;
  @state() page: Page = 'puzzles';

  constructor() {
    super();
    this.addEventListener('play-puzzle', e => this.selectPuzzle(e));
    this.addEventListener('show-puzzles-page', () => this.showPuzzlesPage());
  }

  private selectPuzzle(event: CustomEvent<Game>) {
    this.game = event.detail;
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
