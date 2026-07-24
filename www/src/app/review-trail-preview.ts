import {css, html, LitElement} from 'lit';
import {customElement, property} from 'lit/decorators.js';
import type {Disproof} from '../facts/disproof';
import {describeFact} from '../facts/format';
import type {StepWithContext} from '../facts/utils';
import './icon-button';

@customElement('review-trail-preview')
export class ReviewTrailPreview extends LitElement {
  static override styles = css`
    .disproof-panel {
      width: var(--board-size, 380px);
      max-height: 250px;
      overflow-y: auto;
      background: var(--gd, #ddd);
      border: 1px solid var(--gc, #ccc);
      padding: 12px;
      border-radius: 6px;
      box-sizing: border-box;
      margin-bottom: 16px;
      font-size: 0.9em;
      flex-shrink: 0;
    }
    .disproof-panel h3 {
      margin-top: 0;
      margin-bottom: 10px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 1.1em;
    }
    .apply-fact-button {
      background-color: var(--hover-loc, #bdd4f9);
      color: var(--text-color, #000);
      border: 1px solid var(--gc, #ccc);
      padding: 4px 10px;
      border-radius: 4px;
      cursor: pointer;
      font-weight: 500;
      font-size: 0.85em;
      font-family: inherit;
      transition:
        background-color 0.2s,
        transform 0.1s;
    }
    .apply-fact-button:hover {
      background-color: var(--selection-fill, #bdfe);
    }
    .apply-fact-button:active {
      transform: scale(0.98);
    }
    .scrubber {
      width: 100%;
      margin-top: 8px;
      margin-bottom: 4px;
    }
    .move-counter {
      margin-bottom: 8px;
      font-weight: 500;
      text-align: center;
    }
    .playback-controls {
      display: flex;
      justify-content: center;
      gap: 12px;
      width: 100%;
      margin-bottom: 16px;
    }
    .fact-list {
      display: flex;
      flex-direction: column;
      gap: 4px;
      margin-top: 10px;
    }
    .fact-item {
      padding: 6px 8px;
      border: 1px solid transparent;
      border-radius: 4px;
      cursor: pointer;
    }
    .fact-item:hover {
      background: var(--hover-loc, #bdd4f9);
    }
    .fact-item.active {
      background: var(--gd, #fff);
      border-color: var(--gc, #ccc);
      font-weight: 500;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
    }
  `;

  @property({attribute: false}) previewedDisproof: Disproof | null = null;
  @property({type: Number}) previewStepIndex = -1;
  @property({attribute: false}) trailSteps: StepWithContext[] = [];

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
    if (!this.previewedDisproof) return html``;

    const steps = this.trailSteps;

    return html`
      <input
        class="scrubber"
        type="range"
        min="0"
        max=${steps.length - 1}
        .value=${this.previewStepIndex.toString()}
        @input=${(e: Event) =>
          this.dispatchEventName(
            'scrub-preview',
            parseInt((e.target as HTMLInputElement).value, 10),
          )}
      />
      <div class="move-counter">
        Trail Step ${this.previewStepIndex + 1} / ${steps.length}
      </div>
      <div class="playback-controls">
        <icon-button
          @click=${() => this.dispatchEventName('step-backward-preview')}
          iconName="navigate_before"
          iconSize="large"
          title="Step backward"
          ?disabled=${this.previewStepIndex === 0}
        ></icon-button>
        <icon-button
          @click=${() => this.dispatchEventName('step-forward-preview')}
          iconName="navigate_next"
          iconSize="large"
          title="Step forward"
          ?disabled=${this.previewStepIndex === steps.length - 1}
        ></icon-button>
      </div>

      <div class="disproof-panel">
        <h3>
          <span>Active Trail Preview</span>
          <button
            class="apply-fact-button"
            @click=${() => this.dispatchEventName('exit-preview')}
          >
            Exit
          </button>
        </h3>
        <div class="fact-list">
          ${steps.map(
            (step, index) => html`
              <div
                class="fact-item ${index === this.previewStepIndex ?
                  'active'
                : ''}"
                style="margin-left: ${step.depth * 16}px;"
                @click=${() => this.dispatchEventName('scrub-preview', index)}
              >
                <span style="opacity: 0.6; font-size: 0.9em; margin-right: 4px;"
                  >Step ${index + 1}:</span
                >
                ${describeFact(step.fact)}
              </div>
            `,
          )}
        </div>
      </div>
    `;
  }

  protected override updated(
    changedProperties: Map<string | number | symbol, unknown>,
  ) {
    super.updated(changedProperties);
    if (changedProperties.has('previewStepIndex')) {
      const activeEl = this.shadowRoot?.querySelector('.fact-item.active');
      if (activeEl) {
        activeEl.scrollIntoView({behavior: 'smooth', block: 'nearest'});
      }
    }
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'review-trail-preview': ReviewTrailPreview;
  }
}
