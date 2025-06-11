import {LitElement, css, html} from 'lit';
import {customElement, property} from 'lit/decorators.js';
import * as wasm from 'luke-doku-rust';
import {Game} from '../game/game';
import {iota} from '../game/iota';
import {ensureExhaustiveSwitch} from '../game/utils';

@customElement('puzzle-rating')
export class PuzzleRating extends LitElement {
  @property({type: Object})
  game?: Game;

  static override styles = css`
    :host {
      display: block;
    }
    .complexity-text {
      font-size: small;
      font-style: italic;
    }
  `;

  override render() {
    if (!this.game?.complexity) {
      return undefined;
    }

    const complexity = this.game.complexity;

    return html`
      ${iota(5).map(
        i =>
          html`<mat-icon
            name=${i < complexity ? 'star' : 'star_border'}
          ></mat-icon>`,
      )}
      <span class="complexity-text"> ${complexityText(complexity)} </span>
    `;
  }

  protected override updated(changedProperties: Map<string, any>) {
    if (changedProperties.has('game')) {
      this.waitForGameRating();
    }
  }

  private async waitForGameRating() {
    if (this.game && !this.game.complexity) {
      await this.game.saving;
      if (this.game?.complexity) {
        this.requestUpdate();
      } else {
        this.waitForGameRating();
      }
    }
  }
}

function complexityText(complexity: wasm.Complexity): string {
  switch (complexity) {
    case wasm.Complexity.Simple:
      return 'Simple';
    case wasm.Complexity.Moderate:
      return 'Moderate';
    case wasm.Complexity.Complex:
      return 'Complex';
    case wasm.Complexity.Expert:
      return 'Expert';
    case wasm.Complexity.Lunatic:
      return 'Lunatic';
    default:
      ensureExhaustiveSwitch(complexity);
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'puzzle-rating': PuzzleRating;
  }
}
