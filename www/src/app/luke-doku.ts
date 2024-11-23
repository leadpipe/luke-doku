import './events';
import './game-view';
import './gen-puzzle';
import './sudoku-view';

import {css, html, LitElement, TemplateResult} from 'lit';
import {customElement, property, state} from 'lit/decorators.js';
import {Sudoku} from '../game/sudoku';
import {getCurrentTheme, prefsTarget} from './prefs';
import {Theme} from './types';
import {ensureExhaustiveSwitch} from './utils';

type Page = 'solve' | 'puzzles';

/** Top-level component. */
@customElement('luke-doku')
export class LukeDoku extends LitElement {
  static override styles = css`
    :host {
      display: block;
    }

    gen-puzzle {
      width: 300px;
      margin-top: 32px;
    }

    game-view {
      margin: auto;
    }
  `;

  override render() {
    return this.renderPage();
  }

  private renderPage(): TemplateResult {
    switch (this.page) {
      case 'solve':
        return html`
          <game-view theme=${this.theme} .sudoku=${this.sudoku}></game-view>
        `;
      case 'puzzles':
        return html`
          <gen-puzzle @puzzle-selected=${this.selectPuzzle}></gen-puzzle>
        `;
      default:
        ensureExhaustiveSwitch(this.page);
    }
  }

  @property({reflect: true}) private theme: Theme = getCurrentTheme();

  @state() private sudoku: Sudoku | null = null;
  @state() page: Page = 'puzzles';

  private readonly themeHandler = (event: CustomEvent<Theme>) => {
    this.theme = event.detail;
  };

  override connectedCallback(): void {
    super.connectedCallback();
    prefsTarget.addEventListener('current-theme', this.themeHandler);
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    prefsTarget.removeEventListener('current-theme', this.themeHandler);
  }

  private selectPuzzle(event: CustomEvent<Sudoku>) {
    this.sudoku = event.detail;
    this.page = 'solve';
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'luke-doku': LukeDoku;
  }
}
