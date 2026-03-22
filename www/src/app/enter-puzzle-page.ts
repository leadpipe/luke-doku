import './events';
import './sudoku-view';

import {LitElement, css, html} from 'lit';
import {customElement, query, state} from 'lit/decorators.js';
import {Game} from '../game/game';
import {Grid} from '../game/grid';
import {log} from '../system/analytics';
import {
  lookUpPuzzleByClues,
  openDb,
  type PuzzleRecord,
} from '../system/database';
import {requestPuzzleTesting} from '../system/puzzle-service';
import type {PuzzleTestedMessage} from '../worker/worker-types';
import {addTypeSafeListener, removeTypeSafeListener} from './events';
import {
  getHashState,
  navigateToParam,
  navigateToPuzzle,
  type HashState,
} from './nav';
import {
  INTERACTIVE_SUDOKU_VIEW_SIZES,
  LOGO_FONT_FAMILY,
  LOGO_FONT_SIZE,
} from './styles';
import {cssPixels} from './types';

const CLUES_PARAM = 'clues';

@customElement('enter-puzzle-page')
export class EnterPuzzlePage extends LitElement {
  static override styles = [
    INTERACTIVE_SUDOKU_VIEW_SIZES,
    css`
      :host {
        height: 100vh;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: var(--page-grid-gap);
        --page-grid-gap: 8px;
        --board-size: 380px;
        --board-padding: 10px;
        & > * {
          margin: 20px;
        }
      }
      h1 {
        font-family: ${LOGO_FONT_FAMILY};
        font-size: ${LOGO_FONT_SIZE};
      }
    `,
  ];

  protected override render() {
    return html`
      <sudoku-view
        interactive
        .clues=${this.clues}
        .padding=${cssPixels(10)}
        @cell-modified=${this.noteCellModified}
      >
      </sudoku-view>
      ${this.inDb ?
        html`<button @click=${() => this.playPuzzle()}>Play</button>`
      : this.valid ?
        html`
          <div>
            <label>
              Source of this puzzle:
              <input id="source" type="text" size="50" />
            </label>
            <button @click=${() => this.savePuzzle()}>Save</button>
          </div>
        `
      : ''}
      <h1>Luke-doku</h1>
      <h2>Enter a Puzzle</h2>
    `;
  }

  @state() private clues = new Grid();
  @state() private testResult?: PuzzleTestedMessage;
  @state() private puzzleRecord?: PuzzleRecord;
  @query('#source') private sourceInput?: HTMLInputElement;

  private get valid(): boolean {
    return !!this.testResult?.solutions;
  }

  private get inDb(): boolean {
    return !!this.puzzleRecord;
  }

  override connectedCallback(): void {
    super.connectedCallback();
    addTypeSafeListener(
      window,
      'hash-state-changed',
      this.handleHashStateChanged,
    );
    this.updateToHashState(getHashState());
    this.updateComplete.then(() => {
      this.sourceInput?.focus();
    });
    this.updateUrl();
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    removeTypeSafeListener(
      window,
      'hash-state-changed',
      this.handleHashStateChanged,
    );
  }

  private handleHashStateChanged = async (event: CustomEvent<HashState>) => {
    this.updateToHashState(event.detail);
  };

  private updateToHashState(hashState: HashState) {
    const clues = hashState.params.get(CLUES_PARAM);
    if (clues && clues !== this.clues.toFlatString()) {
      this.clues = new Grid(clues);
      this.updateUrl();
    }
  }

  private async updateUrl() {
    const clues = this.clues.toFlatString();
    const [testResult, puzzleRecord] = await Promise.all([
      requestPuzzleTesting(clues),
      lookUpPuzzleByClues(await openDb(), clues),
      navigateToParam(CLUES_PARAM, clues),
    ]);
    this.testResult = testResult;
    this.puzzleRecord = puzzleRecord;
    log('testResult', testResult, 'puzzleRecord', puzzleRecord);
  }

  private async noteCellModified() {
    await this.updateUrl();
    this.requestUpdate();
  }

  private async savePuzzle() {
    if (!this.valid) {
      return;
    }
    const source = this.sourceInput?.value;
    const game = await Game.saveEnteredPuzzle(
      await openDb(),
      this.clues.toFlatString(),
      this.testResult!.solutions!,
      source,
    );
    await navigateToPuzzle(game.sudoku);
  }

  private async playPuzzle() {
    if (!this.inDb) {
      return;
    }
    const game = await Game.forDbRecord(await openDb(), this.puzzleRecord!);
    await navigateToPuzzle(game.sudoku);
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'enter-puzzle-page': EnterPuzzlePage;
  }
}
