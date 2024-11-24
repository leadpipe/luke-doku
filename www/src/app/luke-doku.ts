import './events';
import './puzzles-page';
import './solve-page';
import './sudoku-view';

import {css, html, LitElement, TemplateResult} from 'lit';
import {customElement, property, state} from 'lit/decorators.js';
import {Sudoku} from '../game/sudoku';
import {ensureExhaustiveSwitch} from '../game/utils';
import {getCurrentTheme, prefsTarget} from './prefs';
import {Theme} from './types';

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
        return html`
          <solve-page theme=${this.theme} .sudoku=${this.sudoku}></solve-page>
        `;
      case 'puzzles':
        return html` <puzzles-page></puzzles-page> `;
      default:
        ensureExhaustiveSwitch(page);
    }
  }

  @property({reflect: true}) private theme: Theme = getCurrentTheme();

  @state() private sudoku: Sudoku | null = null;
  @state() page: Page = 'puzzles';

  constructor() {
    super();
    this.addEventListener('play-puzzle', e => this.selectPuzzle(e));
    this.addEventListener('show-puzzles-page', () => this.showPuzzlesPage());
  }

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

  private showPuzzlesPage() {
    this.page = 'puzzles';
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'luke-doku': LukeDoku;
  }
}
