import './events';
import './game-view';
import './gen-puzzle';
import './sudoku-view';

import {css, html, LitElement} from 'lit';
import {customElement, property, state} from 'lit/decorators.js';
import {Grid} from '../game/grid';
import {getCurrentTheme, prefsTarget} from './prefs';
import {Theme} from './types';

/** Top-level component. */
@customElement('luke-doku')
export class LukeDoku extends LitElement {
  static override styles = css`
    :host {
      display: grid;
      grid-template-columns: 1fr 3fr;
      gap: 20px;
      justify-items: center;
      height: 100vh;
    }

    gen-puzzle {
      width: 300px;
      margin-top: 32px;
    }
  `;

  override render() {
    return html`
      <gen-puzzle @puzzle-selected=${this.selectPuzzle}></gen-puzzle>
      <game-view theme=${this.theme} .puzzle=${this.puzzle}></game-view>
    `;
  }

  @property({reflect: true}) private theme: Theme = getCurrentTheme();

  @state() private puzzle: Grid | null = null;

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

  private selectPuzzle(event: CustomEvent<Grid>) {
    this.puzzle = event.detail;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'luke-doku': LukeDoku;
  }
}
