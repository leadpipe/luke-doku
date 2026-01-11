import './events';
import './puzzles-page';
import './solve-page';
import './sudoku-view';

import {css, html, LitElement, TemplateResult} from 'lit';
import {customElement, state} from 'lit/decorators.js';
import {ifDefined} from 'lit/directives/if-defined.js';
import * as wasm from 'luke-doku-rust';
import {Game, PlayState} from '../game/game';
import {PuzzleId, Sudoku} from '../game/sudoku';
import {dateString} from '../game/types';
import {ensureExhaustiveSwitch} from '../game/utils';
import {
  iterateOngoingPuzzlesDesc,
  lookUpPuzzleById,
  openDb,
} from '../system/database';
import {addTypeSafeListener} from './events';
import {
  getHashState,
  type HashState,
  navigateHome,
  navigateToPath,
  navigateToPuzzle,
} from './nav';
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
    if (window !== window.top) {
      // In an iframe, just show a link to the app.
      return html`<div class="loading">
        <a href="." target="_top">Open Luke-doku</a>
      </div>`;
    }
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
    addTypeSafeListener(
      window,
      'hash-state-changed',
      async (event: CustomEvent<HashState>) => {
        (await this.showGameForPath(event.detail)) ||
          this.showPage('puzzles', this.page === 'loading' ? 'right' : 'left');
      },
    );
    this.startProcess();
  }

  override connectedCallback(): void {
    super.connectedCallback();
    window.addEventListener('focus', this.reloadOnNewDay);
    window.addEventListener('blur', this.reloadOnNewDay);
    document.addEventListener('visibilitychange', this.handleVisibilityChange);
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    window.removeEventListener('focus', this.reloadOnNewDay);
    window.removeEventListener('blur', this.reloadOnNewDay);
    document.removeEventListener(
      'visibilitychange',
      this.handleVisibilityChange,
    );
  }

  private async showGameForPath(hashState: HashState): Promise<boolean> {
    if (hashState.path.length === 1) {
      // The solve page for a specific puzzle.
      const game = await this.tryToLoadGameFromCluesOrId(hashState.path[0]);
      if (game) {
        this.game = game;
        this.showPage('solve', 'right');
        return true;
      }
    }
    return false;
  }

  private async isOnUnstartedGame(hashState: HashState): Promise<boolean> {
    if (hashState.path.length === 1) {
      const game = await this.tryToLoadGameFromCluesOrId(hashState.path[0]);
      if (
        game &&
        game === this.game &&
        game.playState === PlayState.UNSTARTED
      ) {
        return true;
      }
    }
    return false;
  }

  private async startProcess() {
    await this.updateComplete;
    if (await this.showGameForPath(getHashState())) {
      return;
    }
    if (getPuzzleDate() < todayString) {
      await this.goToPuzzleOfTheDay();
    } else {
      await this.goToOngoingGameOrPuzzles();
    }
  }

  private async tryToLoadGameFromCluesOrId(
    cluesOrId: string,
  ): Promise<Game | null> {
    let game = Game.forCluesOrIdString(cluesOrId);
    if (game) {
      return game;
    }
    const db = await openDb();
    const puzzleId = PuzzleId.parse(cluesOrId);
    if (puzzleId) {
      const record = await lookUpPuzzleById(db, puzzleId);
      if (record) {
        game = Game.forDbRecord(db, record);
        return game;
      }
      return await Game.createGame(db, puzzleId.date, puzzleId.counter);
    }
    // TODO: handle a clues string
    return null;
  }

  private readonly reloadOnNewDay = async () => {
    // Note we check for strictly greater than, not just "not equals," to handle
    // the case where local time goes backwards during fast travel westwards.
    if (dateString(new Date()) > todayString) {
      await navigateHome();
      this.showPage('loading', 'left');
      location.reload();
      return true;
    }
    return false;
  };

  private readonly handleVisibilityChange = async () => {
    if (await this.reloadOnNewDay()) {
      return;
    }
    if (await this.isOnUnstartedGame(getHashState())) {
      return;
    }
    await this.goToOngoingGameOrPuzzles();
  };

  private async goToPuzzleOfTheDay() {
    await navigateToPath(
      new PuzzleId(todayString, 1, wasm.generatorVersion()).toString(),
    );
    setPuzzleDateToToday();
  }

  private async goToOngoingGameOrPuzzles() {
    const db = await openDb();
    for await (const cursor of iterateOngoingPuzzlesDesc(db)) {
      await navigateToPuzzle(Sudoku.fromDatabaseRecord(cursor.value));
      return;
    }
    await navigateHome();
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
