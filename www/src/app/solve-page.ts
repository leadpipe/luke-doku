import './events';
import './game-clock';
import './mat-icon';
import './sudoku-view';

import {LitElement, PropertyValues, css, html} from 'lit';
import {customElement, property, query, state} from 'lit/decorators.js';
import {repeat} from 'lit/directives/repeat.js';
import {CompletionState} from '../game/command';
import {PauseReason} from '../game/commands';
import {Game, PlayState} from '../game/game';
import {ReadonlyTrail} from '../game/trail';
import {ReadonlyTrails} from '../game/trails';
import {customEvent} from './events';
import {
  getCurrentSystemTheme,
  getCurrentTheme,
  prefsTarget,
  setPreferredTheme,
} from './prefs';
import {
  HIGHLIGHT_COLOR,
  LOGO_FONT_FAMILY,
  TRAILHEAD_FONT_STYLE,
  TRAILHEAD_FONT_WEIGHT,
} from './styles';
import {SudokuView} from './sudoku-view';
import {TrailColors} from './trail-colors';
import {Theme, ThemeOrAuto, cssPixels} from './types';
import {findDataString, renderPuzzleTitle, setBooleanAttribute} from './utils';

/** Encapsulates the entire game page. */
@customElement('solve-page')
export class SolvePage extends LitElement {
  static override styles = [
    css`
      :host {
        height: 100vh;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: var(--page-grid-gap);
        --page-grid-gap: 8px;
        --top-panel-height: calc(25px + 16px);
      }
      h1 {
        font-family: ${LOGO_FONT_FAMILY};
        font-size: 48px;
        margin-block: 16px;
      }
      h2 {
        margin-block: 8px;
      }

      #top-panel {
        margin-top: var(--page-grid-gap);
        margin-bottom: 16px;
        display: flex;
        justify-content: center;
      }

      #top-panel > div {
        flex: 1 1 0;
        display: flex;
        justify-content: center;
        align-items: baseline;
        gap: 4px 16px;
      }

      sudoku-view {
        width: 380px;
        height: 380px;
      }

      #bottom-panel {
        flex: 1 0 auto;
        display: grid;
        grid-template-columns: 3fr 1fr;
        justify-content: space-between;
        gap: 8px;
        align-items: self-start;
        padding: 8px 0;
      }

      .menu {
        margin: 0;
      }
      .menu table {
        border-collapse: collapse;
      }
      .menu span {
        cursor: default;
      }
      .menu td:has(icon-button) span {
        cursor: pointer;
      }
      .menu tr:has(icon-button[disabled]) span {
        cursor: default;
        opacity: 50%;
      }
      .menu tr:has(td:hover icon-button:not([disabled])) {
        background-color: ${HIGHLIGHT_COLOR};
      }
      .menu td {
        vertical-align: bottom;
      }

      #trails {
        flex-grow: 3;
        display: flex;
        flex-direction: column;
      }

      div.trail {
        display: flex;
        column-gap: 4px;
      }
      .trail > span {
        cursor: pointer;
        flex: 1 0 content;
        display: inline-flex;
        column-gap: 8px;
      }

      span.trail-number {
        text-align: right;
        width: 2em;
      }
      span.trail-assignment {
        flex: 1 0 content;
        display: inline-flex;
        column-gap: 6px;
      }
      span.trail-length {
        min-width: 3em;
        text-align: right;
        padding-right: 8px;
        opacity: 50%;
      }

      div.trail.archived {
        opacity: 60%;
        color: gray;
      }

      .trailhead {
        font-style: ${TRAILHEAD_FONT_STYLE};
        font-weight: ${TRAILHEAD_FONT_WEIGHT};
        min-width: 1em;
        text-align: right;
      }

      #bottom-controls {
        display: flex;
        flex-direction: column;
        height: 100%;
        align-items: center;
      }

      #global-trail-controls {
        display: flex;
        width: 100%;
        justify-content: space-between;
        padding-left: 8px;
      }

      #global-trail-controls icon-button {
        flex: 1 0 0;
      }

      #pause-button {
        display: flex;
        align-items: flex-end;
        flex-grow: 100;
      }

      game-clock {
        flex-grow: 1;
      }
    `,
  ];

  protected override render() {
    const {game, trailColors} = this;
    const playState = game?.playState ?? PlayState.UNSTARTED;
    return [
      this.renderTopPanel(game, playState),
      this.renderBoard(game),
      this.renderBottomPanel(game, playState, trailColors),
    ];
  }

  private renderTopPanel(game: Game | null, playState: PlayState) {
    const {theme} = this;
    const newTheme =
      theme === getCurrentSystemTheme() ?
        theme === 'light' ?
          'dark'
        : 'light'
      : 'auto';
    const newThemeName = newTheme.charAt(0).toUpperCase() + newTheme.slice(1);
    const newThemeIcon = newTheme === 'auto' ? 'contrast' : `${newTheme}_mode`;
    const newThemeTitle = `Switch to ${newThemeName} theme`;
    return html`
      <div id="top-panel">
        <div>
          <icon-button
            id="show-puzzles-button"
            @click=${this.showPuzzlesPage}
            iconName="arrow_back"
            title="Show the puzzles page"
            label="Puzzles"
          ></icon-button>
          ${playState === PlayState.RUNNING ?
            html`
              <icon-button
                @click=${this.undo}
                iconName="undo"
                ?disabled=${!game?.canUndo()}
                title="Undo"
                label="Undo"
              ></icon-button>
              <icon-button
                @click=${this.redo}
                iconName="redo"
                ?disabled=${!game?.canRedo()}
                title="Redo"
                label="Redo"
              ></icon-button>
              <div
                id="game-menu"
                class="menu"
                popover
                @toggle=${this.gameMenuToggled}
              >
                <table @click=${this.hideGameMenu}>
                  <tr>
                    <td @click=${this.undoToStart}>
                      <icon-button
                        iconName="first_page"
                        ?disabled=${!game?.canUndo()}
                      ></icon-button>
                      <span>Undo to start</span>
                    </td>
                  </tr>
                  <tr>
                    <td @click=${this.redoToEnd}>
                      <icon-button
                        iconName="last_page"
                        ?disabled=${!game?.canRedo()}
                      ></icon-button>
                      <span>Redo to end</span>
                    </td>
                  </tr>
                  <tr>
                    <td @click=${this.setTheme} data-theme=${newTheme}>
                      <icon-button iconName=${newThemeIcon}></icon-button>
                      <span>${newThemeTitle}</span>
                    </td>
                  </tr>
                </table>
              </div>
              <icon-button
                @click=${this.toggleGameMenu}
                iconName="more_horiz"
              ></icon-button>
            `
          : html`
              <icon-button
                @click=${this.setTheme}
                iconName=${newThemeIcon}
                title="${newThemeTitle}"
                label="${newThemeName}"
                data-theme=${newTheme}
              ></icon-button>
            `}
        </div>
      </div>
    `;
  }

  private renderBoard(game: Game | null) {
    return html`
      <sudoku-view
        .gameWrapper=${game?.wrapper ?? null}
        .padding=${cssPixels(10)}
        interactive
        @cell-modified=${this.noteCellModified}
        @puzzle-solved=${this.notePuzzleSolved}
      ></sudoku-view>
    `;
  }

  private renderBottomPanel(
    game: Game | null,
    playState: PlayState,
    trailColors: TrailColors | null,
  ) {
    if (!game || !trailColors) return undefined;
    const button = this.renderPauseResume(playState);
    const startOrResumeButton =
      button && playState !== PlayState.RUNNING ?
        html`<div id="resume-button">${button}</div>`
      : undefined;
    const pauseButton = playState === PlayState.RUNNING ? button : undefined;
    const {trails} = game;
    return html`
      ${startOrResumeButton}
      ${pauseButton ? '' : (
        html`
          <h1>Luke-doku</h1>
          <h2>${renderPuzzleTitle(game.sudoku, /*assumeToday=*/ true)}</h2>
          ${game.sudoku.id?.toString()}
        `
      )}
      <div id="bottom-panel">
        <style>
          ${trailColors
            .getColors(trails.order.length)
            .map((c, i) => html` .trail.trail-${i} { color: ${c}; } `)}
        </style>
        <div
          id="trail-menu"
          class="menu"
          popover
          @toggle=${this.trailMenuToggled}
        >
          <table>
            <tr>
              <td @click=${this.copyFromTrail}>
                <icon-button iconName="content_copy"></icon-button>
                <span>Copy from trail</span>
              </td>
              <td></td>
            </tr>
            <tr>
              <td @click=${this.activateTrail}>
                <icon-button iconName="arrow_upward"></icon-button>
                <span>Activate trail</span>
              </td>
              <td>
                <span class="hint">[tap]</span>
              </td>
            </tr>
            <tr>
              <td @click=${this.archiveTrail}>
                <icon-button iconName="archive"></icon-button>
                <span>Archive trail</span>
              </td>
              <td>
                <span class="hint">[long press]</span>
              </td>
            </tr>
          </table>
        </div>
        <div id="trails">
          ${pauseButton ?
            repeat(
              trails.order,
              t => t.id,
              (t, i) => this.renderTrailItem(trails, t, i),
            )
          : ''}
        </div>
        <div id="bottom-controls">
          ${pauseButton ?
            html`
              <div id="global-trail-controls">
                <icon-button
                  @click=${this.toggleTrailsActive}
                  iconName=${trails.active ? 'toggle_on' : 'toggle_off'}
                  label=${trails.active ? 'Active' : 'Inactive'}
                  ?disabled=${trails.order.length === 0}
                ></icon-button>
                <icon-button
                  @click=${this.createTrail}
                  iconName="hiking"
                  label="New trail"
                  ?disabled=${trails.activeTrail?.isEmpty}
                ></icon-button>
              </div>
              <div id="pause-button">${pauseButton}</div>
            `
          : ''}
          <game-clock
            .game=${game}
            ?running=${playState === PlayState.RUNNING}
            @clock-ticked=${this.saveGame}
          ></game-clock>
        </div>
      </div>
    `;
  }

  private renderPauseResume(playState: PlayState) {
    switch (playState) {
      case PlayState.UNSTARTED:
        return html`
          <icon-button
            @click=${this.resumePlay}
            iconName="not_started"
            iconSize="large"
            label="Start"
          ></icon-button>
        `;
      case PlayState.RUNNING:
        return html`
          <icon-button
            @click=${this.pausePlay}
            iconName="pause_circle"
            iconSize="large"
            label="Pause"
          ></icon-button>
        `;
      case PlayState.PAUSED:
        return html`
          <icon-button
            @click=${this.resumePlay}
            iconName="play_circle"
            iconSize="large"
            label="Resume"
          ></icon-button>
        `;
    }
  }

  private renderTrailItem(
    trails: ReadonlyTrails,
    trail: ReadonlyTrail,
    index: number,
  ) {
    const {trailhead} = trail;
    const isVisible = trails.isVisible(trail);
    const isArchived = trails.isArchived(trail);
    const classes = `trail trail-${trail.id} ${isArchived ? 'archived' : ''}`;
    return html`
      <div class=${classes} data-index=${index}>
        <span
          @pointerdown=${this.startTrailClick}
          @pointerup=${this.finishTrailClick}
          @pointercancel=${this.cancelTrailClick}
        >
          <span class="trail-number">${1 + trail.id}:</span>
          <span class="trail-assignment">
            ${trailhead ?
              html`
                <span class="trailhead">${trail.get(trailhead)}</span> ➔
                ${trailhead}
              `
            : '—'}
          </span>
          <span class="trail-length">${trail.getAssignedCount()}</span>
        </span>
        <icon-button
          @click=${this.toggleTrailVisibility}
          iconName=${isVisible ? 'visibility_off' : 'visibility'}
        ></icon-button>
        <icon-button
          @click=${this.toggleTrailMenu}
          iconName="more_horiz"
        ></icon-button>
      </div>
    `;
  }

  @property({attribute: false}) game: Game | null = null;
  @state() private trailColors: TrailColors | null = null;
  @state() private theme = getCurrentTheme();
  @query('sudoku-view') sudokuView?: SudokuView;

  override updated(changedProperties: PropertyValues<this>) {
    if (changedProperties.has('game')) {
      this.trailColors =
        this.game ? new TrailColors(this.game.sudoku.cluesString()) : null;
    }
  }

  private readonly themeHandler = (event: CustomEvent<Theme>) => {
    this.theme = event.detail;
  };

  private readonly foregroundnessHandler = () => {
    if (document.visibilityState !== 'visible') {
      this.pausePlay(PauseReason.AUTO);
    }
  };

  private readonly windowBlurHandler = () => {
    this.pausePlay(PauseReason.AUTO);
  };

  override connectedCallback(): void {
    super.connectedCallback();
    document.addEventListener('visibilitychange', this.foregroundnessHandler);
    window.addEventListener('blur', this.windowBlurHandler);
    prefsTarget.addEventListener('current-theme', this.themeHandler);
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    document.removeEventListener(
      'visibilitychange',
      this.foregroundnessHandler,
    );
    window.removeEventListener('blur', this.windowBlurHandler);
    prefsTarget.removeEventListener('current-theme', this.themeHandler);
  }

  private setTheme(event: Event) {
    const theme = findDataString(event, 'theme');
    setPreferredTheme(theme as ThemeOrAuto);
  }

  private showPuzzlesPage(event_: Event) {
    this.game?.pause(PauseReason.AUTO);
    this.dispatchEvent(
      customEvent('show-puzzles-page', {
        composed: true,
        bubbles: true,
        detail: undefined,
      }),
    );
  }

  private undo(_event: Event) {
    this.game?.undo();
    this.requestUpdate();
  }

  private redo(_event: Event) {
    this.game?.redo();
    this.requestUpdate();
  }

  private undoToStart(_event: Event) {
    this.game?.undoToStart();
    this.requestUpdate();
  }

  private redoToEnd(_event: Event) {
    this.game?.redoToEnd();
    this.requestUpdate();
  }

  private saveGame() {
    this.game?.save();
  }

  private notePuzzleSolved() {
    this.game?.markCompleted(CompletionState.SOLVED);
    this.requestUpdate();
  }

  private noteCellModified() {
    this.requestUpdate();
  }

  private resumePlay() {
    this.game?.resume();
    this.requestUpdate();
  }

  private pausePlay(reason?: PauseReason) {
    this.game?.pause(reason);
    this.requestUpdate();
  }

  private quit() {
    // TODO: implement
  }

  private gameMenuShowing = false;

  private toggleGameMenu(event: Event) {
    const {game} = this;
    const popover = this.shadowRoot?.getElementById('game-menu');
    if (game != null && popover != null) {
      if (this.gameMenuShowing) {
        popover.hidePopover();
      } else {
        this.gameMenuShowing = true;
        this.positionAndOpenPopoverMenu(event, popover);
      }
    }
  }

  private positionAndOpenPopoverMenu(event: Event, popover: HTMLElement) {
    const menuButton = event.target as HTMLElement;
    const buttonRect = menuButton.getBoundingClientRect();
    popover.style.top = `${buttonRect.bottom}px`;
    popover.style.left = `${buttonRect.left}px`;
    const thisRect = this.getBoundingClientRect();
    popover.showPopover();
    const menuRect = popover.getBoundingClientRect();
    if (menuRect.right > thisRect.right) {
      popover.style.left = `${buttonRect.left - (menuRect.right - thisRect.right)}px`;
    }
  }

  private hideGameMenu() {
    this.shadowRoot?.getElementById('game-menu')?.hidePopover();
    this.gameMenuShowing = false;
  }

  private gameMenuToggled(event: ToggleEvent) {
    if (event.newState === 'closed') {
      this.gameMenuShowing = false;
    }
  }

  private createTrail() {
    this.game?.createTrail();
    this.requestUpdate();
  }

  private toggleTrailsActive() {
    this.game?.toggleTrailsActive();
    this.requestUpdate();
  }

  private getTrailIndex(event: Event): number | null {
    const string = findDataString(event, 'index');
    return string != null ? Number(string) : null;
  }

  private toggleTrailVisibility(event: Event) {
    const {game} = this;
    const index = this.getTrailIndex(event);
    if (game != null && index != null) {
      game.toggleTrailVisibility(game.trails.order[index]);
      this.requestUpdate();
    }
  }

  private trailForMenu: ReadonlyTrail | null = null;

  private toggleTrailMenu(event: Event) {
    const {game} = this;
    const index = this.getTrailIndex(event);
    const popover = this.shadowRoot?.getElementById('trail-menu');
    if (game != null && index != null && popover != null) {
      const trail = game.trails.order[index];
      if (trail === this.trailForMenu) {
        popover.hidePopover();
        this.trailForMenu = null;
      } else {
        this.trailForMenu = trail;
        const buttons = popover.getElementsByTagName('icon-button');
        setBooleanAttribute(buttons[0], 'disabled', trail.isEmpty); // the copy button
        setBooleanAttribute(
          buttons[1], // the activate button
          'disabled',
          game.trails.activeTrail === trail,
        );
        setBooleanAttribute(
          buttons[2], // the archive button
          'disabled',
          game.trails.isArchived(trail),
        );
        this.positionAndOpenPopoverMenu(event, popover);
      }
    }
  }

  private trailMenuToggled(event: ToggleEvent) {
    if (event.newState === 'closed') {
      this.trailForMenu = null;
    }
  }

  private hideTrailMenu() {
    this.shadowRoot?.getElementById('trail-menu')?.hidePopover();
    this.trailForMenu = null;
  }

  private copyFromTrail(_event: Event) {
    const {game, trailForMenu} = this;
    if (game != null && trailForMenu != null) {
      game.copyFromTrail(trailForMenu);
      this.hideTrailMenu();
      this.requestUpdate();
      if (!game.trails.active && game.marks.asGrid().isSolved()) {
        this.notePuzzleSolved();
      }
    }
  }

  private activateTrail(_event: Event) {
    const {game, trailForMenu} = this;
    if (game != null && trailForMenu != null) {
      game.activateTrail(trailForMenu);
      this.hideTrailMenu();
      this.requestUpdate();
    }
  }

  private archiveTrail(_event: Event) {
    const {game, trailForMenu} = this;
    if (game != null && trailForMenu != null) {
      game.archiveTrail(trailForMenu);
      this.hideTrailMenu();
      this.requestUpdate();
    }
  }

  private pendingClickedTrailIndex: number | null = null;
  private pendingClickedTrailTimer = 0;

  private startTrailClick(event: PointerEvent) {
    const {game} = this;
    const index = this.getTrailIndex(event);
    this.pendingClickedTrailIndex = null;
    window.clearTimeout(this.pendingClickedTrailTimer);
    if (game != null && index != null) {
      const target = event.target as HTMLElement;
      target.setPointerCapture(event.pointerId);
      event.preventDefault();
      this.pendingClickedTrailIndex = index;
      this.pendingClickedTrailTimer = window.setTimeout(() => {
        if (this.pendingClickedTrailIndex === index) {
          this.pendingClickedTrailIndex = null;
          this.pendingClickedTrailTimer = 0;
          target.releasePointerCapture(event.pointerId);
          navigator.vibrate?.(200);
          game.archiveTrail(game.trails.order[index]);
          this.requestUpdate();
        }
      }, 1000);
    }
  }

  private finishTrailClick(event: PointerEvent) {
    const index = this.pendingClickedTrailIndex;
    if (index != null) {
      this.pendingClickedTrailIndex = null;
      window.clearTimeout(this.pendingClickedTrailTimer);
      this.pendingClickedTrailTimer = 0;
      const trail = this.game?.trails.order[index];
      trail && this.game?.activateTrail(trail);
      this.requestUpdate();
    }
  }

  private cancelTrailClick(event: PointerEvent) {
    this.pendingClickedTrailIndex = null;
    window.clearTimeout(this.pendingClickedTrailTimer);
    this.pendingClickedTrailTimer = 0;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'solve-page': SolvePage;
  }
}
