import './events';
import './mat-icon';

import {css, html, LitElement, PropertyValues} from 'lit';
import {customElement, property} from 'lit/decorators.js';
import {Game} from '../game/game';
import {getShowClock, setShowClock} from './prefs';

/**
 * Displays the clock on the game page, and/or an icon for turning on or off the
 * clock.
 */
@customElement('game-clock')
export class GameClock extends LitElement {
  static override styles = css`
    :host {
      display: block;
      user-select: none;
      -webkit-user-select: none;
    }

    a {
      cursor: pointer;
    }
  `;

  override render() {
    const {game} = this;
    if (!game) return '';
    if (!getShowClock()) {
      return html`
        <a @click=${this.showClock} title="Show clock">
          <mat-icon name="visibility"></mat-icon>
        </a>
      `;
    }
    return html`
      ${this.elapsedTime()}<br />
      <a @click=${this.hideClock} title="Hide clock">
        <mat-icon name="visibility_off"></mat-icon>
      </a>
    `;
  }

  @property({attribute: false}) game: Game | null = null;
  @property({type: Boolean, reflect: true}) running = false;

  protected override updated(_changedProperties: PropertyValues): void {
    if (this.running) {
      const elapsedMs = this.game?.elapsedMs ?? 0;
      window.setTimeout(() => this.clockTicked(), ((elapsedMs - 1) % 1000) + 1);
    }
  }

  private elapsedTime(): string {
    const elapsedMs = this.game?.elapsedMs ?? 0;
    const elapsedSec = Math.ceil(elapsedMs / 1000);
    const elapsedMin = Math.floor(elapsedSec / 60);
    const hrs = Math.floor(elapsedMin / 60);
    const sec = elapsedSec % 60;
    const min = elapsedMin % 60;
    return hrs
      ? `${hrs}:${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
      : `${min}:${String(sec).padStart(2, '0')}`;
  }

  private clockTicked() {
    this.requestUpdate();
    this.dispatchEvent(
      new CustomEvent('clock-ticked', {
        detail: getShowClock(),
        bubbles: true,
        composed: true,
      }),
    );
  }

  private showClock() {
    setShowClock(true);
    this.requestUpdate();
  }

  private hideClock() {
    setShowClock(false);
    this.requestUpdate();
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'game-clock': GameClock;
  }
}
