import './game-clock';
import './icon-button';
import './puzzle-rating';
import './replay-view';

import {css, html, LitElement} from 'lit';
import {customElement, property, state} from 'lit/decorators.js';
import type {Fact} from '../facts/Fact';
import {describeFact} from '../facts/format';
import {compareFacts, nub, unitContains} from '../facts/utils';
import {CommandTag, CompletionState} from '../game/command';
import {Game} from '../game/game';
import {Loc} from '../game/loc';
import {PlaybackGame} from '../game/playback';
import {ensureExhaustiveSwitch} from '../game/utils';
import {requestFactDeduction} from '../system/puzzle-service';
import {navigateToPuzzle} from './nav';
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
    .action-section {
      text-align: center;
      margin-bottom: 16px;
      display: flex;
      flex-direction: column;
      gap: 4px;
      min-height: 60px;
      flex-shrink: 0;
    }
    .fact-panel {
      width: var(--board-size);
      max-height: 200px;
      overflow-y: auto;
      background: var(--gd);
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
      margin-top: 0;
      margin-bottom: 8px;
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

  @property({attribute: false}) game: Game | null = null;
  @state() private playback: PlaybackGame | null = null;
  @state() private facts: readonly Fact[] = [];
  @state() private isPlayingForward = false;
  @state() private isPlayingBackward = false;
  @state() private selectedLoc: Loc | null = null;

  private playIntervalId: number | null = null;
  private interestingIndices: number[] = [];

  override willUpdate(changedProperties: Map<string, any>) {
    if (changedProperties.has('game') && this.game) {
      this.playback = new PlaybackGame(this.game.sudoku, this.game.history);
      this.computeInterestingIndices();
      if (this.game.completionState === CompletionState.SOLVED) {
        this.playback.index = 0;
      }
      this.updateFacts();
      // Start playback when arriving on the page
      this.playForward();
    }
  }

  private computeInterestingIndices() {
    if (!this.game) {
      this.interestingIndices = [];
      return;
    }
    const history = this.game.history;
    if (history.length === 0) {
      this.interestingIndices = [0];
      return;
    }

    const indices = new Set<number>();
    indices.add(0);
    indices.add(history.length);

    const totalTime = history[history.length - 1].elapsedTimestamp;
    const avgTime = totalTime / history.length;

    const isTrailCommand = (tag: CommandTag | undefined) => {
      return (
        tag === CommandTag.CREATE_TRAIL ||
        tag === CommandTag.ACTIVATE_TRAIL ||
        tag === CommandTag.TOGGLE_TRAIL_VISIBILITY ||
        tag === CommandTag.TOGGLE_TRAILS_ACTIVE
        // Note we leave out ARCHIVE_TRAIL and COPY_FROM_TRAIL
      );
    };

    const isUndoRedo = (tag: CommandTag | undefined) => {
      return (
        tag === CommandTag.UNDO ||
        tag === CommandTag.REDO ||
        tag === CommandTag.UNDO_TO_START ||
        tag === CommandTag.REDO_TO_END
      );
    };

    for (let i = 0; i < history.length; i++) {
      const current = history[i];
      const prev = i > 0 ? history[i - 1] : undefined;
      const prevPrev = i > 1 ? history[i - 2] : undefined;

      // 1. Time gap > 5x average
      const delta =
        current.elapsedTimestamp - (prev ? prev.elapsedTimestamp : 0);
      if (delta >= 5 * avgTime) {
        indices.add(i);
      }

      const cmdTag = current.command.tag();
      const prevCmdTag = prev?.command.tag();
      const prevPrevCmdTag = prevPrev?.command.tag();

      // 2. Trail commands (first in a series, and COPY_FROM_TRAIL)
      if (isTrailCommand(cmdTag) && !isTrailCommand(prevCmdTag)) {
        indices.add(i);
      }
      if (prevCmdTag === CommandTag.COPY_FROM_TRAIL) {
        indices.add(i);
      }

      // 3. Undo/Redo commands (first in series, and after last in series if > 1)
      if (isUndoRedo(cmdTag) && !isUndoRedo(prevCmdTag)) {
        indices.add(i);
      }
      if (
        !isUndoRedo(cmdTag) &&
        isUndoRedo(prevCmdTag) &&
        isUndoRedo(prevPrevCmdTag)
      ) {
        indices.add(i);
      }

      // 4. Before Resume
      if (cmdTag === CommandTag.RESUME) {
        indices.add(i);
      }
    }

    this.interestingIndices = Array.from(indices).sort((a, b) => a - b);
  }

  private async updateFacts() {
    if (!this.playback) return;
    const grid = this.playback.wrapper.game.asGrid();
    const gridString = grid.toFlatString();
    try {
      const response = await requestFactDeduction(gridString, 5000);
      this.facts = [...response.facts].sort(compareFacts);
    } catch (e) {
      console.error('Failed to deduce facts:', e);
      this.facts = [];
    }
  }

  private clearPlayInterval() {
    if (this.playIntervalId !== null) {
      window.clearInterval(this.playIntervalId);
      this.playIntervalId = null;
    }
    this.isPlayingForward = false;
    this.isPlayingBackward = false;
  }

  private playForward() {
    this.clearPlayInterval();
    this.isPlayingForward = true;
    this.playIntervalId = window.setInterval(() => this.stepForward(true), 500);
  }

  private playBackward() {
    this.clearPlayInterval();
    this.isPlayingBackward = true;
    this.playIntervalId = window.setInterval(
      () => this.stepBackward(true),
      500,
    );
  }

  private stepForward(fromInterval = false) {
    if (!fromInterval) this.clearPlayInterval();
    if (!this.playback) return;
    if (this.playback.index < this.playback.history.length) {
      this.playback.index++;
      this.updateFacts();
    } else if (fromInterval) {
      this.clearPlayInterval();
    }
  }

  private stepBackward(fromInterval = false) {
    if (!fromInterval) this.clearPlayInterval();
    if (!this.playback) return;
    if (this.playback.index > 0) {
      this.playback.index--;
      this.updateFacts();
    } else if (fromInterval) {
      this.clearPlayInterval();
    }
  }

  private skipForward() {
    this.clearPlayInterval();
    if (!this.playback) return;
    const nextIdx = this.interestingIndices.find(
      idx => idx > this.playback!.index,
    );
    if (nextIdx !== undefined) {
      this.playback.index = nextIdx;
      this.updateFacts();
    }
  }

  private skipBackward() {
    this.clearPlayInterval();
    if (!this.playback) return;
    const reversed = [...this.interestingIndices].reverse();
    const prevIdx = reversed.find(idx => idx < this.playback!.index);
    if (prevIdx !== undefined) {
      this.playback.index = prevIdx;
      this.updateFacts();
    }
  }

  private pause() {
    this.clearPlayInterval();
  }

  private onScrub(e: Event) {
    this.clearPlayInterval();
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

  private onCellSelected(e: CustomEvent<Loc | null>) {
    this.selectedLoc = e.detail;
  }

  private readonly keydownHandler = (event: KeyboardEvent) => {
    if (!this.playback) return;
    if (event.target instanceof HTMLInputElement) return;

    if (event.key === 'ArrowLeft') {
      this.stepBackward();
    } else if (event.key === 'ArrowRight') {
      this.stepForward();
    } else if (event.key === ' ') {
      event.preventDefault();
      if (this.isPlayingForward) {
        this.pause();
      } else {
        this.playForward();
      }
    } else if (event.key === 'Backspace') {
      event.preventDefault();
      if (this.isPlayingBackward) {
        this.pause();
      } else {
        this.playBackward();
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
    this.clearPlayInterval();
  }

  override render() {
    if (!this.playback) return html`<div>Loading...</div>`;
    const command = this.playback.currentCommand;
    const prevCommand =
      this.playback.index >= 2 ?
        this.playback.history[this.playback.index - 2]
      : undefined;
    const nextCommand =
      this.playback.index < this.playback.history.length ?
        this.playback.history[this.playback.index]
      : undefined;
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
        .gameWrapper=${this.playback.wrapper}
        .facts=${this.facts}
        .selectedLoc=${this.selectedLoc}
        .actionLoc=${command && 'loc' in command.command ?
          (command.command as any).loc
        : null}
        @cell-selected=${this.onCellSelected}
      ></replay-view>

      <div id="middle-controls">
        <input
          class="scrubber"
          type="range"
          min="0"
          max=${this.playback.history.length}
          .value=${this.playback.index.toString()}
          @input=${this.onScrub}
        />
        <div class="move-counter">
          Move ${this.playback.index} / ${this.playback.history.length}
        </div>
        <div class="playback-controls">
          <icon-button
            @click=${() => this.stepBackward()}
            iconName="navigate_before"
            iconSize="large"
            title="Step backward"
            ?disabled=${this.playback.index === 0}
          ></icon-button>
          <icon-button
            @click=${this.skipBackward}
            iconName="skip_previous"
            iconSize="large"
            title="Skip backward"
            ?disabled=${this.playback.index === 0}
          ></icon-button>
          <icon-button
            @click=${this.playBackward}
            iconName="play_arrow"
            ?flip=${true}
            iconSize="large"
            title="Play backward"
            ?disabled=${this.isPlayingBackward || this.playback.index === 0}
          ></icon-button>
          <icon-button
            @click=${this.pause}
            iconName="pause"
            iconSize="large"
            title="Pause"
            ?disabled=${!this.isPlayingForward && !this.isPlayingBackward}
          ></icon-button>
          <icon-button
            @click=${this.playForward}
            iconName="play_arrow"
            iconSize="large"
            title="Play forward"
            ?disabled=${this.isPlayingForward ||
            this.playback.index === this.playback.history.length}
          ></icon-button>
          <icon-button
            @click=${this.skipForward}
            iconName="skip_next"
            iconSize="large"
            title="Skip forward"
            ?disabled=${this.playback.index === this.playback.history.length}
          ></icon-button>
          <icon-button
            @click=${() => this.stepForward()}
            iconName="navigate_next"
            iconSize="large"
            title="Step forward"
            ?disabled=${this.playback.index === this.playback.history.length}
          ></icon-button>
        </div>
      </div>

      <div class="action-section">
        ${command ?
          html`
            <div>Action: ${command.command.toString()}</div>
            ${command.command.tag() === CommandTag.RESUME ?
              html`<div>
                Time:
                ${new Date((command.command as any).timestamp).toLocaleString()}
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

      ${this.renderSelectedFacts()}

      <div id="bottom-info">
        <h2>
          Review ${renderPuzzleTitle(this.playback.wrapper.game.sudoku, true)}
        </h2>
        <puzzle-rating .game=${this.game ?? undefined}></puzzle-rating>
        <game-clock
          .game=${this.playback.wrapper.game}
          .overrideElapsedMs=${command?.elapsedTimestamp}
        ></game-clock>
      </div>
    `;
  }

  private renderSelectedFacts() {
    if (!this.selectedLoc) {
      return html`<div class="fact-panel">Select a cell to see facts</div>`;
    }
    const loc = this.selectedLoc;
    const locIndex = loc.index;

    const relevantFacts = this.facts.filter(fact => {
      const base = nub(fact);
      switch (base.type) {
        case 'SingleLoc':
        case 'SingleNum':
        case 'SpeculativeAssignment':
        case 'NoNum':
          return base.loc === locIndex;
        case 'NoLoc':
          return unitContains(base.unit, loc);
        case 'Conflict':
          return base.locs.includes(locIndex);
        case 'Overlap':
          return (
            unitContains(base.unit, loc) && unitContains(base.cross_unit, loc)
          );
        case 'Subset':
          return base.locs.includes(locIndex);
        case 'Implication':
          return false;
        default:
          ensureExhaustiveSwitch(base);
      }
    });

    if (relevantFacts.length === 0) {
      return html`<div class="fact-panel">No deduced facts for this cell</div>`;
    }

    return html`
      <div class="fact-panel">
        <h3>Facts for Cell</h3>
        <ul>
          ${relevantFacts.map(fact => html`<li>${describeFact(fact)}</li>`)}
        </ul>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'review-page': ReviewPage;
  }
}
