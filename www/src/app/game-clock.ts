import './events';
import './icon-button';
import './mat-icon';

import {css, html, LitElement, PropertyValues} from 'lit';
import {customElement, property} from 'lit/decorators.js';
import {BaseGame} from '../game/game';
import {dispatchTypeSafeEvent} from './events';
import {getShowClock, setShowClock} from './prefs';
import {elapsedTimeString} from './utils';

/**
 * Displays the clock on the game page, and/or an icon for turning on or off the
 * clock.
 */
@customElement('game-clock')
export class GameClock extends LitElement {
  static override styles = css`
    :host {
      display: flex;
      justify-content: space-between;
      min-width: 100px;
      align-items: flex-end;
      user-select: none;
      -webkit-user-select: none;
    }
  `;

  override render() {
    const {game} = this;
    if (!game) return '';
    if (!getShowClock()) {
      return html`
        <icon-button
          @click=${this.showClock}
          iconName="visibility"
          title="Show clock"
        ></icon-button>
      `;
    }
    return html`
      <icon-button
        @click=${this.hideClock}
        iconName="visibility_off"
        title="Hide clock"
      ></icon-button>
      ${this.elapsedTime()}
    `;
  }

  @property({attribute: false}) game: BaseGame | null = null;
  @property({type: Number}) overrideElapsedMs?: number;
  @property({type: Boolean, reflect: true}) running = false;

  protected override updated(_changedProperties: PropertyValues): void {
    if (this.running) {
      const elapsedMs = this.overrideElapsedMs ?? this.game?.elapsedMs ?? 0;
      window.setTimeout(() => this.clockTicked(), 1000 - (elapsedMs % 1000));
    }
  }

  private elapsedTime(): string {
    const ms = this.overrideElapsedMs ?? this.game?.elapsedMs ?? 0;
    return elapsedTimeString(ms);
  }

  private clockTicked() {
    this.requestUpdate();
    dispatchTypeSafeEvent(this, 'clock-ticked', getShowClock());
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
