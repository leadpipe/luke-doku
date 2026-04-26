import './sudoku-view';

import {css, html, LitElement} from 'lit';
import {customElement, property, state} from 'lit/decorators.js';
import {CompletionState} from '../game/command';
import {Game} from '../game/game';
import {PlaybackGame} from '../game/playback';
import {deduceFacts} from '../wasm';

@customElement('review-page')
export class ReviewPage extends LitElement {
  static override styles = css`
    :host {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 100vh;
      width: 100vw;
      background-color: var(--bg-color);
    }
    .scrubber {
      width: 80%;
      max-width: 500px;
      margin: 20px 0;
    }
    .info {
      margin-bottom: 20px;
      text-align: center;
    }
    h2 {
      margin: 0 0 10px 0;
    }
    sudoku-view {
      max-width: 500px;
      max-height: 500px;
      width: 100vw;
      aspect-ratio: 1 / 1;
    }
    .header {
      position: absolute;
      top: 0;
      left: 0;
      padding: 10px;
    }
    .header a {
      color: var(--fg-color);
      text-decoration: none;
      font-weight: bold;
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

  override render() {
    if (!this.playback) return html`<div>Loading...</div>`;
    const command = this.playback.currentCommand;
    return html`
      <div class="header">
        <a href="#/">← Home</a>
      </div>
      <div class="info">
        <h2>Reviewing Game</h2>
        <div>Move ${this.playback.index} / ${this.playback.history.length}</div>
        ${command ? html`<div>Action: ${command.command.constructor.name}</div>` : ''}
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
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'review-page': ReviewPage;
  }
}
