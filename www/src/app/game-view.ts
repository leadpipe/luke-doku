import './events';
import './game-clock';
import './mat-icon';
import './sudoku-view';

import {LitElement, PropertyValues, css, html} from 'lit';
import {customElement, property, state} from 'lit/decorators.js';
import * as wasm from 'luke-doku-rust';
import {getCurrentSystemTheme, setPreferredTheme} from './prefs';
import {Theme, ThemeOrAuto, cssPixels} from './types';
import {Game} from '../game/game';

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

      a {
        text-decoration: none;
        cursor: pointer;
        user-select: none;
        -webkit-user-select: none;
      }

      :host a {
        color: var(--text-color);
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
    return [this.renderControls(theme, game), this.renderGame(theme, game)];
  }

  private renderControls(theme: Theme, game: Game | null) {
    const newTheme =
      theme === getCurrentSystemTheme()
        ? theme === 'light'
          ? 'dark'
          : 'light'
        : 'auto';
    return html`
      <div id="controls">
        <div>
          <a @click=${this.setTheme} title="Switch to ${newTheme} theme">
            <mat-icon
              name=${newTheme === 'auto' ? 'contrast' : `${newTheme}_mode`}
              data-theme=${newTheme}
            ></mat-icon>
          </a>
        </div>
      </div>
    `;
  }

  private renderGame(theme: Theme, game: Game | null) {
    return html`
      <sudoku-view
        theme=${theme}
        .game=${game}
        ?running=${!game?.isPaused}
        .padding=${cssPixels(10)}
        interactive
      ></sudoku-view>
      <div id="below-grid">
        ${game
          ? html`
              <game-clock
                .game=${game}
                ?running=${!game?.isPaused}
                @clock-ticked=${this.saveGame}
              ></game-clock>
              ${game.isPaused
                ? html`
                    <div>
                      ${game.isStarted
                        ? html`
                            <a @click=${this.resumePlay} title="Resume play">
                              <mat-icon
                                name="play_circle"
                                size="large"
                              ></mat-icon>
                            </a>
                          `
                        : html`
                            <a @click=${this.resumePlay} title="Start play">
                              <mat-icon
                                name="not_started"
                                size="large"
                              ></mat-icon>
                            </a>
                          `}
                    </div>
                  `
                : html`
                    <div>
                      <a @click=${this.pausePlay} title="Pause play">
                        <mat-icon name="pause_circle" size="large"></mat-icon>
                      </a>
                    </div>
                  `}
            `
          : ''}
      </div>
    `;
  }
  @property({reflect: true}) private theme: Theme = 'light';
  @property({attribute: false}) puzzle: wasm.Grid | null = null;
  @state() game: Game | null = null;

  override updated(changedProperties: PropertyValues<this>) {
    if (changedProperties.has('puzzle')) {
      this.game = this.puzzle ? new Game(this.puzzle) : null;
    }
  }

  private setTheme(event: Event) {
    const theme = (event.target as HTMLElement).dataset.theme;
    setPreferredTheme(theme as ThemeOrAuto);
  }

  private saveGame() {
    // TODO: implement
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
