import './game-clock';
import './icon-button';
import './sudoku-view';

import {css, html, LitElement} from 'lit';
import {customElement, property, state} from 'lit/decorators.js';
import {CompletionState} from '../game/command';
import {Game} from '../game/game';
import {PlaybackGame} from '../game/playback';
import {deduceFacts} from '../wasm';
import {navigateToPuzzle} from './nav';
import {renderPuzzleTitle} from './utils';

@customElement('review-page')
export class ReviewPage extends LitElement {
  static override styles = css`
    :host {
      height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: var(--page-grid-gap);
      --page-grid-gap: 8px;
      --board-size: 380px;
      --board-padding: 10px;
      background-color: var(--bg-color);
    }
    #top-panel {
      margin-top: var(--page-grid-gap);
      margin-bottom: 16px;
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      width: var(--board-size);
    }
    .scrubber {
      width: 80%;
      max-width: var(--board-size);
      margin: 20px 0;
    }
    .info {
      text-align: center;
      margin-bottom: 20px;
    }
    h2 {
      margin-block: 8px;
    }
    sudoku-view {
      max-width: var(--board-size);
      max-height: var(--board-size);
      width: 100vw;
      aspect-ratio: 1 / 1;
    }
    #bottom-controls {
      display: flex;
      flex-direction: column;
      height: 100%;
      align-items: center;
      width: var(--board-size);
    }
    game-clock {
      flex-grow: 1;
      width: 100%;
    }
  `;

  @property({attribute: false}) game: Game | null = null;
  @state() private playback: PlaybackGame | null = null;
  @state() private facts: any[] = [];

  override willUpdate(changedProperties: Map<string, any>) {
    if (changedProperties.has('game') && this.game) {
      this.playback = new PlaybackGame(this.game.sudoku, this.game.history);
      if (this.game.completionState === CompletionState.SOLVED) {
        this.playback.index = 0;
      }
      this.updateFacts();
    }
  }

  private updateFacts() {
    if (!this.playback) return;
    const grid = this.playback.wrapper.game.marks.asGrid();
    const wasmGrid = grid.toWasm();
    try {
      this.facts = deduceFacts(wasmGrid) || [];
    } catch (e) {
      console.error('Failed to deduce facts:', e);
      this.facts = [];
    } finally {
      wasmGrid.free();
    }
  }

  private onScrub(e: Event) {
    const input = e.target as HTMLInputElement;
    if (this.playback) {
      this.playback.index = parseInt(input.value, 10);
      this.updateFacts();
    }
  }

  private goBack() {
    if (this.game) {
      navigateToPuzzle(this.game.sudoku);
    }
  }

  private readonly keydownHandler = (event: KeyboardEvent) => {
    if (!this.playback) return;
    if (event.target instanceof HTMLInputElement) return;
    
    if (event.key === 'ArrowLeft') {
      this.playback.index = Math.max(0, this.playback.index - 1);
      this.updateFacts();
    } else if (event.key === 'ArrowRight') {
      this.playback.index = Math.min(this.playback.history.length, this.playback.index + 1);
      this.updateFacts();
    }
  };

  override connectedCallback(): void {
    super.connectedCallback();
    window.addEventListener('keydown', this.keydownHandler);
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    window.removeEventListener('keydown', this.keydownHandler);
  }

  override render() {
    if (!this.playback) return html`<div>Loading...</div>`;
    const command = this.playback.currentCommand;
    return html`
      <div id="top-panel">
        <icon-button
          @click=${this.goBack}
          iconName="arrow_back"
          title="Return to the puzzle"
          label="Puzzle"
        ></icon-button>
        <div style="flex: 1"></div>
      </div>
      <sudoku-view
        .gameWrapper=${this.playback.wrapper}
        .facts=${this.facts}
      ></sudoku-view>
      <input
        class="scrubber"
        type="range"
        min="0"
        max=${this.playback.history.length}
        .value=${this.playback.index.toString()}
        @input=${this.onScrub}
      />
      <div class="info">
        <h2>Review ${renderPuzzleTitle(this.playback.wrapper.game.sudoku, true)}</h2>
        <div>Move ${this.playback.index} / ${this.playback.history.length}</div>
        ${command ? html`<div>Action: ${command.command.constructor.name}</div>` : ''}
      </div>
      <div id="bottom-controls">
        <game-clock 
          .game=${this.playback.wrapper.game}
          .overrideElapsedMs=${command?.elapsedTimestamp}
        ></game-clock>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'review-page': ReviewPage;
  }
}
