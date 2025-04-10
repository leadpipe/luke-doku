import './events';
import './puzzles-page';
import './solve-page';
import './sudoku-view';

import {css, html, LitElement, TemplateResult} from 'lit';
import {customElement, state} from 'lit/decorators.js';
import {ifDefined} from 'lit/directives/if-defined.js';
import {Game} from '../game/game';
import {ensureExhaustiveSwitch} from '../game/utils';
import {iterateOngoingPuzzlesDesc, openDb} from '../system/database';
import {getPuzzleDate, setPuzzleDateToToday} from './prefs';
import {todayString} from './utils';

type Page = 'loading' | 'solve' | 'puzzles';

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
      .loading {
        font-style: italic;
        display: flex;
        justify-content: center;
        align-items: center;
        height: 100vh;
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
      this.renderPage('loading', pageClasses),
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
      case 'loading':
        return html`<div class="loading ${ifDefined(pageClasses.get(page))}">
          Loading...
        </div>`;
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
  @state() private page: Page = 'loading';
  @state() private nextPage?: Page;
  @state() private nextPageClass?: 'left' | 'right';

  constructor() {
    super();
    this.addEventListener('play-puzzle', e => this.selectPuzzle(e));
    this.addEventListener('show-puzzles-page', () => this.showPuzzlesPage());

    if (getPuzzleDate() < todayString) {
      this.loadPuzzleOfTheDay();
    } else {
      this.loadOngoingGameOrPuzzles();
    }
  }

  private selectPuzzle(event: CustomEvent<Game>) {
    this.game = event.detail;
    this.showPage('solve', 'right');
  }

  private showPuzzlesPage() {
    this.showPage('puzzles', 'left');
  }

  private async loadPuzzleOfTheDay() {
    const db = await openDb();
    const index = db.transaction('puzzles').store.index('byPuzzleId');
    let game: Game | null = null;
    for await (const cursor of index.iterate(
      // The puzzle of the day is the first puzzle of the day.
      IDBKeyRange.bound([todayString, 1], [todayString, 2]),
    )) {
      game = Game.forDbRecord(db, cursor.value);
      break;
    }
    if (!game) {
      game = await Game.createGame(db, todayString, 1);
    }
    this.game = game;
    this.showPage('solve', 'right');
    setPuzzleDateToToday();
  }

  private async loadOngoingGameOrPuzzles() {
    const db = await openDb();
    for await (const cursor of iterateOngoingPuzzlesDesc(db)) {
      this.game = Game.forDbRecord(db, cursor.value);
      this.showPage('solve', 'right');
      return;
    }
    this.showPage('puzzles', 'right');
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
