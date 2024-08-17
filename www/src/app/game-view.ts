import './events';
import './game-clock';
import './mat-icon';
import './sudoku-view';

import {LitElement, PropertyValues, css, html} from 'lit';
import {customElement, property, query, state} from 'lit/decorators.js';
import {getCurrentSystemTheme, setPreferredTheme} from './prefs';
import {Theme, ThemeOrAuto, cssPixels} from './types';
import {Game, GameState} from '../game/game';
import {Grid} from '../game/grid';
import {SudokuView} from './sudoku-view';

/** Encapsulates the entire game page. */
@customElement('game-view')
export class GameView extends LitElement {
  static override styles = [
    css`
      :host {
        padding-top: var(--page-grid-gap);
        display: flex;
        flex-direction: column;
        gap: var(--page-grid-gap);
        --page-grid-gap: 8px;
        --below-grid-height: 80px;
        --controls-height: calc(25px + 16px);
      }

      button {
        text-decoration: none;
        cursor: pointer;
        user-select: none;
        -webkit-user-select: none;
        color: inherit;
        background: none;
        border: none;
        padding: 0;
      }

      button:disabled {
        cursor: auto;
        color: gray;
      }

      #controls {
        margin-bottom: 16px;
        display: flex;
        justify-content: center;
      }

      #controls > div {
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

      #below-grid {
        height: var(--below-grid-height);
        width: 100%;
        display: flex;
        align-items: center;
        user-select: none;
        -webkit-user-select: none;
      }

      #below-grid > * {
        text-align: center;
        flex: 3 1 0;
      }

      #below-grid > *:nth-child(odd) {
        flex: 1 1 0;
      }
    `,
  ];

  protected override render() {
    const {theme, game} = this;
    const gameState = game?.state ?? GameState.UNSTARTED;
    const running = gameState === GameState.RUNNING;
    return [
      this.renderControls(theme, game, gameState, running),
      this.renderGame(theme, game, gameState, running),
    ];
  }

  private renderControls(
    theme: Theme,
    game: Game | null,
    gameState: GameState,
    running: boolean,
  ) {
    const newTheme =
      theme === getCurrentSystemTheme()
        ? theme === 'light'
          ? 'dark'
          : 'light'
        : 'auto';
    return html`
      <div id="controls">
        <div>
          <button @click=${this.setTheme} title="Switch to ${newTheme} theme">
            <mat-icon
              name=${newTheme === 'auto' ? 'contrast' : `${newTheme}_mode`}
              data-theme=${newTheme}
            ></mat-icon>
          </button>
          ${running
            ? html`
                <button
                  @click=${this.undoToStart}
                  ?disabled=${!game?.canUndo()}
                  title="Undo to start"
                >
                  <mat-icon name="first_page"></mat-icon>
                </button>
                <button
                  @click=${this.undo}
                  ?disabled=${!game?.canUndo()}
                  title="Undo"
                >
                  <mat-icon name="undo"></mat-icon>
                </button>
                <button
                  @click=${this.redo}
                  ?disabled=${!game?.canRedo()}
                  title="Redo"
                >
                  <mat-icon name="redo"></mat-icon>
                </button>
                <button
                  @click=${this.redoToEnd}
                  ?disabled=${!game?.canRedo()}
                  title="Redo to end"
                >
                  <mat-icon name="last_page"></mat-icon>
                </button>
              `
            : ''}
        </div>
      </div>
    `;
  }

  private renderGame(
    theme: Theme,
    game: Game | null,
    gameState: GameState,
    running: boolean,
  ) {
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
      <div id="below-grid">
        ${game
          ? html`
              <game-clock
                .game=${game}
                ?running=${running}
                @clock-ticked=${this.saveGame}
              ></game-clock>
              ${this.renderPauseResume(game.state)}
            `
          : ''}
      </div>
    `;
  }

  private renderPauseResume(gameState: GameState) {
    switch (gameState) {
      case GameState.UNSTARTED:
        return html`
          <div>
            <button @click=${this.resumePlay} title="Start play">
              <mat-icon name="not_started" size="large"></mat-icon>
            </button>
          </div>
        `;
      case GameState.RUNNING:
        return html`
          <div>
            <button @click=${this.pausePlay} title="Pause play">
              <mat-icon name="pause_circle" size="large"></mat-icon>
            </button>
          </div>
        `;
      case GameState.PAUSED:
        return html`
          <div>
            <button @click=${this.resumePlay} title="Resume play">
              <mat-icon name="play_circle" size="large"></mat-icon>
            </button>
          </div>
        `;
    }
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

  private undo(_event: Event) {
    this.game?.undo();
    this.sudokuView?.requestUpdate();
    this.requestUpdate();
  }

  private redo(_event: Event) {
    this.game?.redo();
    this.sudokuView?.requestUpdate();
    this.requestUpdate();
  }

  private undoToStart(_event: Event) {
    this.game?.undoToStart();
    this.sudokuView?.requestUpdate();
    this.requestUpdate();
  }

  private redoToEnd(_event: Event) {
    this.game?.redoToEnd();
    this.sudokuView?.requestUpdate();
    this.requestUpdate();
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
      this.requestUpdate();
    }
  }

  private pausePlay() {
    const {game} = this;
    if (game) {
      game.pause();
      this.requestUpdate();
    }
  }

  private quit() {
    // TODO: implement
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'game-view': GameView;
  }
}
