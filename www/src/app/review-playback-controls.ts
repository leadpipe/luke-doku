import {css, html, LitElement} from 'lit';
import {customElement, property} from 'lit/decorators.js';
import './icon-button';

@customElement('review-playback-controls')
export class ReviewPlaybackControls extends LitElement {
  static override styles = css`
    :host {
      display: flex;
      flex-direction: column;
      align-items: center;
      width: 100%;
    }
    .scrubber {
      width: 100%;
      margin-top: 8px;
      margin-bottom: 4px;
    }
    .move-counter {
      margin-bottom: 8px;
      font-weight: 500;
    }
    .playback-controls {
      display: flex;
      justify-content: center;
      gap: 12px;
      width: 100%;
      margin-bottom: 16px;
    }
    .deviation-count {
      color: var(--multi-value-default, #0a0);
      font-weight: bold;
    }
    .digression-active {
      color: var(--multi-value-default, #0a0);
    }
    .reset-digression-button {
      margin-top: 4px;
      margin-bottom: 8px;
      background: none;
      border: 1px solid var(--gc, #ccc);
      color: var(--text-color);
      padding: 4px 12px;
      border-radius: 12px;
      cursor: pointer;
      font-size: 0.85em;
      font-family: inherit;
      transition: background-color 0.2s;
    }
    .reset-digression-button:hover {
      background-color: var(--gd, #ddd);
    }
  `;

  @property({type: Number}) historyLength = 0;
  @property({type: Number}) index = 0;
  @property({type: Number}) deviationsLength = 0;
  @property({type: Boolean}) isPlayingForward = false;
  @property({type: Boolean}) isPlayingBackward = false;

  private dispatchEventName(name: string, detail?: any) {
    this.dispatchEvent(
      new CustomEvent(name, {
        detail,
        bubbles: true,
        composed: true,
      }),
    );
  }

  override render() {
    return html`
      <input
        class="scrubber"
        type="range"
        min="0"
        max=${this.historyLength}
        .value=${this.index.toString()}
        @input=${(e: Event) =>
          this.dispatchEventName(
            'scrub',
            parseInt((e.target as HTMLInputElement).value, 10),
          )}
      />
      <div
        class="move-counter ${this.deviationsLength > 0 ?
          'digression-active'
        : ''}"
      >
        ${this.deviationsLength > 0 ?
          html`Move ${this.index}
            <span class="deviation-count">+${this.deviationsLength}</span> /
            ${this.historyLength}`
        : html`Move ${this.index} / ${this.historyLength}`}
      </div>
      ${this.deviationsLength > 0 ?
        html`
          <button
            class="reset-digression-button"
            @click=${() => this.dispatchEventName('exit-digression')}
          >
            Exit Alternate Path
          </button>
        `
      : ''}
      <div class="playback-controls">
        <icon-button
          @click=${() => this.dispatchEventName('step-backward')}
          iconName="navigate_before"
          iconSize="large"
          title="Step backward"
          ?disabled=${this.index === 0 && this.deviationsLength === 0}
        ></icon-button>
        <icon-button
          @click=${() => this.dispatchEventName('skip-backward')}
          iconName="skip_previous"
          iconSize="large"
          title="Skip backward"
          ?disabled=${this.index === 0 || this.deviationsLength > 0}
        ></icon-button>
        <icon-button
          @click=${() => this.dispatchEventName('play-backward')}
          iconName="play_arrow"
          ?flip=${true}
          iconSize="large"
          title="Play backward"
          ?disabled=${this.isPlayingBackward ||
          this.index === 0 ||
          this.deviationsLength > 0}
        ></icon-button>
        <icon-button
          @click=${() => this.dispatchEventName('pause')}
          iconName="pause"
          iconSize="large"
          title="Pause"
          ?disabled=${!this.isPlayingForward && !this.isPlayingBackward}
        ></icon-button>
        <icon-button
          @click=${() => this.dispatchEventName('play-forward')}
          iconName="play_arrow"
          iconSize="large"
          title="Play forward"
          ?disabled=${this.isPlayingForward ||
          this.index === this.historyLength ||
          this.deviationsLength > 0}
        ></icon-button>
        <icon-button
          @click=${() => this.dispatchEventName('skip-forward')}
          iconName="skip_next"
          iconSize="large"
          title="Skip forward"
          ?disabled=${this.index === this.historyLength ||
          this.deviationsLength > 0}
        ></icon-button>
        <icon-button
          @click=${() => this.dispatchEventName('step-forward')}
          iconName="navigate_next"
          iconSize="large"
          title="Step forward"
          ?disabled=${this.index === this.historyLength ||
          this.deviationsLength > 0}
        ></icon-button>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'review-playback-controls': ReviewPlaybackControls;
  }
}
