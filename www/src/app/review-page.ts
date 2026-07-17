import './game-clock';
import './icon-button';
import './puzzle-rating';
import './replay-view';
import './review-fact-panel';
import './review-playback-controls';
import './review-trail-preview';

import {css, html, LitElement} from 'lit';
import {customElement, property} from 'lit/decorators.js';
import type {Fact} from '../facts/Fact';
import {nub} from '../facts/utils';
import {CommandTag} from '../game/command';
import {SetNum} from '../game/commands';
import {Game} from '../game/game';
import {Loc} from '../game/loc';
import type {DisproofMetadata} from '../worker/worker-types';

import {navigateToPuzzle} from './nav';
import {ReviewController} from './review-controller';
import {elapsedTimeString, renderPuzzleTitle} from './utils';

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
      --gf: light-dark(#fff, #000);
      --gd: light-dark(#ddd, #222);
      --gc: light-dark(#ccc, #333);
      --bg-color: var(--gf);
      background-color: var(--bg-color);
      overflow-y: auto;
    }
    #top-panel {
      margin-top: var(--page-grid-gap);
      margin-bottom: 16px;
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      width: var(--board-size);
      flex-shrink: 0;
    }
    replay-view {
      max-width: var(--board-size);
      max-height: var(--board-size);
      width: 100vw;
      aspect-ratio: 1 / 1;
      flex-shrink: 0;
    }
    #middle-controls {
      display: flex;
      flex-direction: column;
      align-items: center;
      width: var(--board-size);
      flex-shrink: 0;
    }
    .action-section {
      text-align: center;
      margin-bottom: 16px;
      display: flex;
      flex-direction: column;
      gap: 4px;
      min-height: 60px;
      flex-shrink: 0;
    }
    #bottom-info {
      display: flex;
      flex-direction: column;
      align-items: center;
      width: var(--board-size);
      margin-top: auto;
      padding-bottom: 24px;
      flex-shrink: 0;
    }
    h2 {
      margin-block: 8px;
      text-align: center;
    }
    game-clock {
      width: 100%;
      margin-top: 8px;
    }
  `;

  private controller = new ReviewController(this);

  @property({attribute: false})
  get game(): Game | null {
    return this.controller.game;
  }
  set game(newGame: Game | null) {
    this.controller.game = newGame;
  }

  private goBack = () => {
    if (this.game) {
      navigateToPuzzle(this.game.sudoku);
    }
  };

  private readonly keydownHandler = (event: KeyboardEvent) => {
    if (!this.controller.playback) return;
    if (event.target instanceof HTMLInputElement) return;

    if (this.controller.previewedDisproof) {
      const steps = this.controller.getPreviewTrailSteps();
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        this.controller.setPreviewStepIndex(
          Math.max(0, this.controller.previewStepIndex - 1),
        );
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        this.controller.setPreviewStepIndex(
          Math.min(steps.length - 1, this.controller.previewStepIndex + 1),
        );
      } else if (event.key === 'Escape') {
        event.preventDefault();
        this.controller.exitPreviewMode();
      }
      return;
    }

    if (event.key === 'ArrowLeft') {
      this.controller.stepBackward();
    } else if (event.key === 'ArrowRight') {
      this.controller.stepForward();
    } else if (event.key === ' ') {
      event.preventDefault();
      if (this.controller.isPlayingForward) {
        this.controller.pause();
      } else {
        this.controller.playForward();
      }
    } else if (event.key === 'Backspace') {
      event.preventDefault();
      if (this.controller.isPlayingBackward) {
        this.controller.pause();
      } else {
        this.controller.playBackward();
      }
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
    if (!this.controller.playback) return html`<div>Loading...</div>`;

    const combinedHistory = [
      ...this.controller.playback.history.slice(
        0,
        this.controller.playback.index,
      ),
      ...this.controller.playback.deviations,
    ];
    const command =
      combinedHistory.length > 0 ?
        combinedHistory[combinedHistory.length - 1]
      : undefined;
    const prevCommand =
      combinedHistory.length >= 2 ?
        combinedHistory[combinedHistory.length - 2]
      : undefined;
    const nextCommand =
      (
        this.controller.playback.deviations.length === 0 &&
        this.controller.playback.index < this.controller.playback.history.length
      ) ?
        this.controller.playback.history[this.controller.playback.index]
      : undefined;

    let effectiveSelectedFact = this.controller.selectedFact;
    let effectiveFacts = this.controller.facts;
    let effectiveDisproofs = this.controller.disproofs;
    if (this.controller.isPlayingForward) {
      effectiveFacts = [];
      effectiveDisproofs = [];
      if (
        nextCommand &&
        nextCommand.command.tag() === CommandTag.SET_NUM
      ) {
        const setNumCmd = nextCommand.command as SetNum;
        const locIndex = setNumCmd.loc.index;
        const num = setNumCmd.num;

        const matchingFact = this.controller.facts.find(f => {
          const base = nub(f);
          return (
            (base.type === 'SingleLoc' || base.type === 'SingleNum') &&
            base.loc === locIndex &&
            base.num === num
          );
        });

        if (matchingFact) {
          effectiveSelectedFact = matchingFact;
        } else {
          effectiveSelectedFact = {
            type: 'SpeculativeAssignment',
            loc: locIndex,
            num: num,
          };
        }
      }
    }

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
      <replay-view
        .gameWrapper=${this.controller.playback.wrapper}
        .facts=${effectiveFacts}
        .disproofs=${effectiveDisproofs}
        .productivityScores=${this.controller.productivityScores}
        .selectedLoc=${this.controller.selectedLoc}
        .selectedFact=${this.controller.previewedDisproof ||
        effectiveSelectedFact}
        .actionLoc=${command && 'loc' in command.command ?
          (command.command as any).loc
        : null}
        .previewStepIndex=${this.controller.previewStepIndex}
        .previewHighlights=${this.controller.getPreviewHighlights()}
        .previewVisibleFacts=${this.controller.getPreviewVisibleFacts()}
        .appliedDisproofs=${this.controller.playback.getAppliedDisproofs()}
        @cell-selected=${(e: CustomEvent<Loc | null>) =>
          this.controller.onCellSelected(e.detail)}
      ></replay-view>

      <div id="middle-controls">
        ${this.controller.previewedDisproof ?
          html`
            <review-trail-preview
              .previewedDisproof=${this.controller.previewedDisproof}
              .previewStepIndex=${this.controller.previewStepIndex}
              .trailSteps=${this.controller.getPreviewTrailSteps()}
              @exit-preview=${() => this.controller.exitPreviewMode()}
              @scrub-preview=${(e: CustomEvent<number>) =>
                this.controller.setPreviewStepIndex(e.detail)}
              @step-backward-preview=${() =>
                this.controller.setPreviewStepIndex(
                  Math.max(0, this.controller.previewStepIndex - 1),
                )}
              @step-forward-preview=${() => {
                const steps = this.controller.getPreviewTrailSteps();
                this.controller.setPreviewStepIndex(
                  Math.min(
                    steps.length - 1,
                    this.controller.previewStepIndex + 1,
                  ),
                );
              }}
            ></review-trail-preview>
          `
        : html`
            <review-playback-controls
              .historyLength=${this.controller.playback.history.length}
              .index=${this.controller.playback.index}
              .deviationsLength=${this.controller.playback.deviations.length}
              .isPlayingForward=${this.controller.isPlayingForward}
              .isPlayingBackward=${this.controller.isPlayingBackward}
              @scrub=${(e: CustomEvent<number>) =>
                this.controller.setPlaybackIndex(e.detail)}
              @exit-digression=${() => this.controller.exitDigression()}
              @step-backward=${() => this.controller.stepBackward()}
              @skip-backward=${() => this.controller.skipBackward()}
              @play-backward=${() => this.controller.playBackward()}
              @pause=${() => this.controller.pause()}
              @play-forward=${() => this.controller.playForward()}
              @skip-forward=${() => this.controller.skipForward()}
              @step-forward=${() => this.controller.stepForward()}
            ></review-playback-controls>
          `}
      </div>

      ${this.controller.previewedDisproof ? ''
      : this.controller.playback.deviations.length === 0 ?
        html`
          <div class="action-section">
            ${command ?
              html`
                <div>Action: ${command.command.toString()}</div>
                ${command.command.tag() === CommandTag.RESUME ?
                  html`<div>
                    Time:
                    ${new Date(
                      (command.command as any).timestamp,
                    ).toLocaleString()}
                  </div>`
                : html`<div>
                    Time spent:
                    ${elapsedTimeString(
                      command.elapsedTimestamp -
                        (prevCommand ? prevCommand.elapsedTimestamp : 0),
                    )}
                  </div>`}
              `
            : ''}
            ${nextCommand ?
              html`<div>
                Next: ${nextCommand.command.toString()}
                (${elapsedTimeString(
                  nextCommand.elapsedTimestamp -
                    (command ? command.elapsedTimestamp : 0),
                )})
              </div>`
            : ''}
          </div>
        `
      : ''}

      <review-fact-panel
        .selectedLoc=${this.controller.selectedLoc}
        .selectedLocFacts=${this.controller.selectedLocFacts}
        .selectedFact=${this.controller.selectedFact}
        .isSearching=${this.controller.isSearching}
        .searchStatus=${this.controller.searchStatus}
        .productivityScores=${this.controller.productivityScores}
        @fact-selected=${(e: CustomEvent<Fact | DisproofMetadata>) =>
          this.controller.setSelectedFact(e.detail)}
        @apply-fact=${(e: CustomEvent<{loc: number; num: number}>) =>
          this.controller.applySelectedFact(e.detail)}
        @apply-disproof=${(e: CustomEvent<DisproofMetadata>) =>
          this.controller.applyDisproof(e.detail)}
        @preview-disproof=${(e: CustomEvent<DisproofMetadata>) =>
          this.controller.enterPreview(e.detail)}
      ></review-fact-panel>

      <div id="bottom-info">
        <h2>
          Review
          ${renderPuzzleTitle(
            this.controller.playback.wrapper.game.sudoku,
            true,
          )}
        </h2>
        <puzzle-rating .game=${this.game ?? undefined}></puzzle-rating>
        <game-clock
          .game=${this.controller.playback.wrapper.game}
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
