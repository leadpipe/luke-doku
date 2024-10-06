import './events';
import './game-clock';
import './mat-icon';
import './sudoku-view';

import {LitElement, PropertyValues, css, html} from 'lit';
import {customElement, property, query, state} from 'lit/decorators.js';
import {repeat} from 'lit/directives/repeat.js';
import {getCurrentSystemTheme, setPreferredTheme} from './prefs';
import {Theme, ThemeOrAuto, cssPixels} from './types';
import {Game, GameState} from '../game/game';
import {Grid} from '../game/grid';
import {SudokuView} from './sudoku-view';
import {ReadonlyTrail} from 'src/game/trail';
import {ReadonlyTrails} from 'src/game/trails';

/** Encapsulates the entire game page. */
@customElement('game-view')
export class GameView extends LitElement {
  static override styles = [
    css`
      :host {
        padding-top: var(--page-grid-gap);
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: var(--page-grid-gap);
        --page-grid-gap: 8px;
        --top-panel-height: calc(25px + 16px);
      }

      #top-panel {
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
        width: 100%;
        display: grid;
        grid-template-columns: 3fr 1fr;
        justify-content: space-between;
        gap: 8px;
        align-items: self-start;
        padding: 8px 0;
      }

      #trails {
        flex-grow: 3;
        display: flex;
        flex-direction: column;
      }

      .trail span {
        cursor: pointer;
      }

      .trail.archived > span {
        opacity: 50%;
      }

      .trailhead {
        font-weight: 700;
        font-style: italic;
      }

      #bottom-controls {
        display: flex;
        flex-direction: column;
        height: 100%;
        align-items: center;
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
    const {theme, game} = this;
    const gameState = game?.state ?? GameState.UNSTARTED;
    return [
      this.renderTopPanel(theme, game, gameState),
      this.renderBoard(theme, game, gameState),
      this.renderBottomPanel(theme, game, gameState),
    ];
  }

  private renderTopPanel(
    theme: Theme,
    game: Game | null,
    gameState: GameState,
  ) {
    const newTheme =
      theme === getCurrentSystemTheme()
        ? theme === 'light'
          ? 'dark'
          : 'light'
        : 'auto';
    const newThemeName =
      newTheme === 'auto' ? 'System' : newTheme === 'dark' ? 'Dark' : 'Light';
    return html`
      <div id="top-panel">
        <div>
          <icon-button
            @click=${this.setTheme}
            iconName=${newTheme === 'auto' ? 'contrast' : `${newTheme}_mode`}
            title="Switch to ${newThemeName} theme"
            label="${newThemeName} theme"
            data-theme=${newTheme}
          ></icon-button>
          ${gameState === GameState.RUNNING
            ? html`
                <icon-button
                  @click=${this.undoToStart}
                  iconName="first_page"
                  ?disabled=${!game?.canUndo()}
                  title="Undo to start"
                  label="Undo all"
                ></icon-button>
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
                <icon-button
                  @click=${this.redoToEnd}
                  iconName="last_page"
                  ?disabled=${!game?.canRedo()}
                  title="Redo to end"
                  label="Redo all"
                ></icon-button>
              `
            : ''}
        </div>
      </div>
    `;
  }

  private renderBoard(theme: Theme, game: Game | null, gameState: GameState) {
    return html`
      <sudoku-view
        theme=${theme}
        .game=${game}
        .gameState=${gameState}
        .padding=${cssPixels(10)}
        interactive
        @cell-modified=${this.noteCellModified}
        @puzzle-solved=${this.notePuzzleSolved}
      ></sudoku-view>
    `;
  }

  private renderBottomPanel(
    _theme: Theme,
    game: Game | null,
    gameState: GameState,
  ) {
    if (!game) return undefined;
    const button = this.renderPauseResume(gameState);
    const startOrResumeButton =
      button && gameState !== GameState.RUNNING
        ? html`<div id="resume-button">${button}</div>`
        : undefined;
    const pauseButton = gameState === GameState.RUNNING ? button : undefined;
    const {trails} = game;
    return html`
      ${startOrResumeButton}
      <div id="bottom-panel">
        <div id="trails">
          ${pauseButton
            ? repeat(
                trails.order,
                t => t.id,
                (t, i) => this.renderTrailItem(trails, t, i),
              )
            : ''}
        </div>
        <div id="bottom-controls">
          ${pauseButton
            ? html`
                <div>
                  <icon-button
                    @click=${this.createTrail}
                    iconName="hiking"
                    label="New trail"
                  ></icon-button>
                  <icon-button
                    @click=${this.toggleTrailsActive}
                    iconName=${trails.active ? 'toggle_on' : 'toggle_off'}
                    label=${trails.active ? 'Active' : 'Inactive'}
                    ?disabled=${trails.order.length === 0}
                  ></icon-button>
                </div>
                <div id="pause-button">${pauseButton}</div>
              `
            : ''}
          <game-clock
            .game=${game}
            ?running=${gameState === GameState.RUNNING}
            @clock-ticked=${this.saveGame}
          ></game-clock>
        </div>
      </div>
    `;
  }

  private renderPauseResume(gameState: GameState) {
    switch (gameState) {
      case GameState.UNSTARTED:
        return html`
          <icon-button
            @click=${this.resumePlay}
            iconName="not_started"
            iconSize="large"
            label="Start"
          ></icon-button>
        `;
      case GameState.RUNNING:
        return html`
          <icon-button
            @click=${this.pausePlay}
            iconName="pause_circle"
            iconSize="large"
            label="Pause"
          ></icon-button>
        `;
      case GameState.PAUSED:
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
          ${1 + trail.id}:
          ${trailhead
            ? html`
                <span class="trailhead">${trail.get(trailhead)}</span> ➔
                ${trailhead}
              `
            : '—'}
          <span class="trail-length">${trail.getAssignedCount()}</span>
        </span>
        <icon-button
          @click=${this.activateTrail}
          iconName="arrow_upward"
          label="Activate"
          ?disabled=${trail === trails.activeTrail}
        ></icon-button>
        <icon-button
          @click=${this.toggleTrailVisibility}
          iconName=${isVisible ? 'visibility_off' : 'visibility'}
          label=${isVisible ? 'Hide' : 'Show'}
        ></icon-button>
        <icon-button
          @click=${this.archiveTrail}
          iconName="archive"
          label="Archive"
          ?disabled=${isArchived}
        ></icon-button>
        <icon-button
          @click=${this.copyFromTrail}
          iconName="content_copy"
          label="Copy"
          ?disabled=${trail.isEmpty}
        ></icon-button>
      </div>
    `;
  }

  @property({reflect: true}) private theme: Theme = 'light';
  @property({attribute: false}) puzzle: Grid | null = null;
  @state() game: Game | null = null;
  @query('sudoku-view') sudokuView?: SudokuView;

  override updated(changedProperties: PropertyValues<this>) {
    if (changedProperties.has('puzzle')) {
      this.game = this.puzzle ? new Game(this.puzzle) : null;
    }
  }

  private setTheme(event: Event) {
    const theme = (event.target as HTMLElement).dataset.theme;
    setPreferredTheme(theme as ThemeOrAuto);
  }

  private gameUpdated() {
    this.sudokuView?.requestUpdate();
    this.requestUpdate();
  }

  private undo(_event: Event) {
    this.game?.undo();
    this.gameUpdated();
  }

  private redo(_event: Event) {
    this.game?.redo();
    this.gameUpdated();
  }

  private undoToStart(_event: Event) {
    this.game?.undoToStart();
    this.gameUpdated();
  }

  private redoToEnd(_event: Event) {
    this.game?.redoToEnd();
    this.gameUpdated();
  }

  private saveGame() {
    // TODO: implement
  }

  private notePuzzleSolved() {
    this.requestUpdate();
  }

  private noteCellModified() {
    this.requestUpdate();
  }

  private resumePlay() {
    const {game} = this;
    if (game) {
      game.resume();
      this.gameUpdated();
    }
  }

  private pausePlay() {
    const {game} = this;
    if (game) {
      game.pause();
      this.gameUpdated();
    }
  }

  private quit() {
    // TODO: implement
  }

  private createTrail() {
    const {game} = this;
    if (game) {
      game.createTrail();
      this.gameUpdated();
    }
  }

  private toggleTrailsActive() {
    const {game} = this;
    if (game) {
      game.toggleTrailsActive();
      this.gameUpdated();
    }
  }

  private getTrailIndex(event: Event): number | null {
    const target = event.target as HTMLElement;
    for (let el: HTMLElement | null = target; el; el = el.parentElement) {
      if (el.dataset.index != null) {
        return Number(el.dataset.index);
      }
    }
    return null;
  }

  private activateTrail(event: Event) {
    const {game} = this;
    const index = this.getTrailIndex(event);
    if (game != null && index != null) {
      game.activateTrail(game.trails.order[index]);
      this.gameUpdated();
    }
  }

  private toggleTrailVisibility(event: Event) {
    const {game} = this;
    const index = this.getTrailIndex(event);
    if (game != null && index != null) {
      game.toggleTrailVisibility(game.trails.order[index]);
      this.gameUpdated();
    }
  }

  private archiveTrail(event: Event) {
    const {game} = this;
    const index = this.getTrailIndex(event);
    if (game != null && index != null) {
      game.archiveTrail(game.trails.order[index]);
      this.gameUpdated();
    }
  }

  private copyFromTrail(event: Event) {
    const {game} = this;
    const index = this.getTrailIndex(event);
    if (game != null && index != null) {
      game.copyFromTrail(game.trails.order[index]);
      this.gameUpdated();
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
          navigator.vibrate(200);
          game.archiveTrail(game.trails.order[index]);
          this.gameUpdated();
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
      this.gameUpdated();
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
    'game-view': GameView;
  }
}
