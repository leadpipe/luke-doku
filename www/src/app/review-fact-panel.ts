import {css, html, LitElement} from 'lit';
import {customElement, property} from 'lit/decorators.js';
import {Disproof, isDisproof} from '../facts/disproof';
import type {Fact} from '../facts/Fact';
import {describeFact, formatDisproofDescription, shorthandFact} from '../facts/format';
import {getTotalAntecedents} from '../facts/utils';
import {Loc} from '../game/loc';
import type {DisproofMetadata} from '../worker/worker-types';
import {getFactAssignment} from './review-controller';

function getFactLabel(fact: Fact | DisproofMetadata): string {
  if (fact.type === 'DisproofMetadata') {
    return fact.label;
  }
  if (isDisproof(fact as Fact)) {
    return formatDisproofDescription(fact as Disproof);
  }
  return describeFact(fact as Fact);
}

@customElement('review-fact-panel')
export class ReviewFactPanel extends LitElement {
  static override styles = css`
    .fact-panel {
      width: var(--board-size, 380px);
      max-height: 200px;
      overflow-y: auto;
      background: var(--gd, #ddd);
      padding: 8px;
      border-radius: 4px;
      box-sizing: border-box;
      margin-bottom: 16px;
      font-size: 0.9em;
      flex-shrink: 0;
    }
    .fact-panel pre {
      margin: 0;
      white-space: pre-wrap;
    }
    .fact-panel h3 {
      position: sticky;
      top: -8px;
      margin-top: -8px;
      margin-left: -8px;
      margin-right: -8px;
      padding: 8px;
      background: var(--gd, #ddd);
      z-index: 10;
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 1px solid var(--gc, #ccc);
      margin-bottom: 8px;
    }
    .search-status {
      font-size: 0.85em;
      color: var(--multi-value-default, #0a0);
      font-weight: normal;
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
  `;

  @property({attribute: false}) selectedLoc: Loc | null = null;
  @property({attribute: false}) selectedLocFacts: (Fact | DisproofMetadata)[] = [];
  @property({attribute: false}) selectedFact: Fact | DisproofMetadata | null = null;
  @property({type: Boolean}) isSearching = false;
  @property({type: String}) searchStatus = '';
  @property({attribute: false}) productivityScores = new Map<string, number | 'loading'>();

  private dispatchEventName(name: string, detail: any) {
    this.dispatchEvent(
      new CustomEvent(name, {
        detail,
        bubbles: true,
        composed: true,
      }),
    );
  }

  override updated(changedProperties: Map<string, any>) {
    super.updated(changedProperties);
    if (changedProperties.has('selectedFact') && this.selectedFact) {
      const checkedRadio = this.shadowRoot?.querySelector(
        'input[name="selectedFact"]:checked',
      );
      if (checkedRadio) {
        checkedRadio.parentElement?.scrollIntoView({
          block: 'nearest',
        });
      }
    }
  }

  override render() {
    if (!this.selectedLoc) {
      return html`
        <div class="fact-panel">
          Select a cell to see facts
          ${this.isSearching ?
            html`<div class="search-status" style="margin-top: 4px;">
              ${this.searchStatus}
            </div>`
          : ''}
        </div>
      `;
    }

    const relevantFacts = this.selectedLocFacts;

    if (relevantFacts.length === 0) {
      return html`
        <div class="fact-panel">
          No deduced facts for this cell
          ${this.isSearching ?
            html`<div class="search-status" style="margin-top: 4px;">
              ${this.searchStatus}
            </div>`
          : ''}
        </div>
      `;
    }

    const assignment =
      this.selectedFact ? getFactAssignment(this.selectedFact) : null;
    const isMetadata =
      this.selectedFact &&
      'type' in this.selectedFact &&
      this.selectedFact.type === 'DisproofMetadata';
    const disproof =
      isMetadata ? (this.selectedFact as DisproofMetadata) : null;
    const showDisproofActions = disproof !== null;

    return html`
      <div class="fact-panel">
        <h3>
          <span>Facts for Cell ${this.selectedLoc}</span>
          ${this.isSearching ?
            html`<span class="search-status" style="margin-left: 8px;"
              >${this.searchStatus}</span
            >`
          : ''}
          ${assignment ?
            html`
              <button
                class="apply-fact-button"
                @click=${() => this.dispatchEventName('apply-fact', assignment)}
              >
                Apply Fact to Grid
              </button>
            `
          : ''}
          ${showDisproofActions ?
            html`
              <div style="display: flex; gap: 6px;">
                <button
                  class="apply-fact-button"
                  @click=${() => this.dispatchEventName('preview-disproof', disproof)}
                >
                  Detail View
                </button>
                <button
                  class="apply-fact-button"
                  style="background-color: var(--multi-value-default); color: #000;"
                  @click=${() => this.dispatchEventName('apply-disproof', disproof)}
                >
                  Apply
                </button>
              </div>
            `
          : ''}
        </h3>
        <div style="display: flex; flex-direction: column; gap: 6px;">
          ${relevantFacts.map(fact => {
            let label = getFactLabel(fact);
            const isFactDisproof = isDisproof(fact as Fact);
            const isFactMetadata =
              'type' in fact && fact.type === 'DisproofMetadata';
            if (isFactDisproof || isFactMetadata) {
              const shorthand =
                isFactMetadata ?
                  (fact as DisproofMetadata).shorthand
                : shorthandFact(fact as Fact);
              const steps =
                isFactMetadata ?
                  (fact as DisproofMetadata).totalAntecedents
                : getTotalAntecedents(fact as Fact);
              const score = this.productivityScores.get(shorthand);
              const stepsText = steps === 1 ? '1 step' : `${steps} steps`;
              if (typeof score === 'number') {
                label = `[Productivity +${score}, ${stepsText}] ${label}`;
              } else if (score === 'loading') {
                label = `[Productivity calculating..., ${stepsText}] ${label}`;
              }
            }
            return html`
              <label
                style="display: flex; gap: 8px; align-items: flex-start; cursor: pointer;"
              >
                <input
                  type="radio"
                  name="selectedFact"
                  .checked=${this.selectedFact === fact}
                  @change=${() => this.dispatchEventName('fact-selected', fact)}
                  style="margin-top: 2px;"
                />
                <span>${label}</span>
              </label>
            `;
          })}
        </div>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'review-fact-panel': ReviewFactPanel;
  }
}
