import './events';
import './puzzles-page';
import './solve-page';
import './sudoku-view';

import {css, html, LitElement, TemplateResult} from 'lit';
import {customElement, state} from 'lit/decorators.js';
import {ifDefined} from 'lit/directives/if-defined.js';
import type {Game} from '../game/game';
import {ensureExhaustiveSwitch} from '../game/utils';

type Page = 'solve' | 'puzzles';

/** Top-level component. */
@customElement('luke-doku')
export class LukeDoku extends LitElement {
  static override styles = css`
    :host {
      display: block;
      > * {
        position: absolute;
        width: 100vw;
        transform: translateX(0);
      }
      .left {
        transform: translateX(-100%);
      }
      .right {
        transform: translateX(100%);
      }
    }
    :host(.transition) {
      > * {
        transition: transform 300ms;
        transform: translateX(0);
      }
      .to-left {
        transform: translateX(-100%);
      }
      .to-right {
        transform: translateX(100%);
      }
    }
  `;

  override render() {
    const {page, nextPage, nextPageClass} = this;
    const pageClass =
      nextPageClass && (nextPageClass === 'left' ? 'to-right' : 'to-left');
    const pageClasses = new Map([
      [page, pageClass],
      [nextPage, nextPageClass],
    ]);
    return [
      this.renderPage('puzzles', pageClasses),
      this.renderPage('solve', pageClasses),
    ];
  }

  private renderPage(
    page: Page,
    pageClasses: Map<Page | undefined, string | undefined>,
  ): TemplateResult {
    if (!pageClasses.has(page)) return html``;
    switch (page) {
      case 'solve':
        return html`
          <solve-page
            .game=${this.game}
            class=${ifDefined(pageClasses.get(page))}
            @transitionend=${this.pageTransitionEnd}
          ></solve-page>
        `;
      case 'puzzles':
        return html`
          <puzzles-page
            class=${ifDefined(pageClasses.get(page))}
            @transitionend=${this.pageTransitionEnd}
          ></puzzles-page>
        `;
      default:
        ensureExhaustiveSwitch(page);
    }
  }

  @state() private game: Game | null = null;
  @state() private page: Page = 'puzzles';
  @state() private nextPage?: Page;
  @state() private nextPageClass?: 'left' | 'right';

  constructor() {
    super();
    this.addEventListener('play-puzzle', e => this.selectPuzzle(e));
    this.addEventListener('show-puzzles-page', () => this.showPuzzlesPage());
  }

  private selectPuzzle(event: CustomEvent<Game>) {
    this.game = event.detail;
    this.showPage('solve', 'right');
  }

  private showPuzzlesPage() {
    this.showPage('puzzles', 'left');
  }

  private async showPage(page: Page, pageClass: 'left' | 'right') {
    if (this.page === page) return;
    this.nextPage = page;
    this.nextPageClass = pageClass;
    await this.updateComplete;
    requestAnimationFrame(() => this.classList.add('transition'));
  }

  private pageTransitionEnd() {
    if (this.nextPage) {
      this.page = this.nextPage;
      this.nextPage = undefined;
      this.nextPageClass = undefined;
      this.classList.remove('transition');
    }
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'luke-doku': LukeDoku;
  }
}
