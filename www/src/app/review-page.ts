import './game-clock';
import './icon-button';
import './puzzle-rating';
import './replay-view';

import {css, html, LitElement} from 'lit';
import {customElement, property, state} from 'lit/decorators.js';
import {Disproof, isDisproof} from '../facts/disproof';
import type {Fact} from '../facts/Fact';
import {describeFact, shorthandFact} from '../facts/format';
import {
  compareFacts,
  flattenImplication,
  getTotalAntecedents,
  nub,
  unitContains,
} from '../facts/utils';
import {CommandTag, CompletionState} from '../game/command';
import {ClearCell, SetNum, SetNums} from '../game/commands';
import {Game} from '../game/game';
import {Loc} from '../game/loc';
import {PlaybackGame} from '../game/playback';
import {ensureExhaustiveSwitch} from '../game/utils';
import * as wasm from '../wasm';

import {
  requestErroneousAssignmentDisproof,
  requestErroneousProductivityCalculation,
  requestFactDeduction,
} from '../system/puzzle-service';
import {navigateToPuzzle} from './nav';
import {
  computeInterestingIndices,
  formatDisproofDescription,
  getEliminationConstraints,
} from './review-utils';
import {elapsedTimeString, renderPuzzleTitle} from './utils';

function getFactAssignment(fact: Fact): {loc: number; num: number} | null {
  const base = nub(fact);
  if (
    base.type === 'SingleLoc' ||
    base.type === 'SingleNum' ||
    base.type === 'SpeculativeAssignment'
  ) {
    return {loc: base.loc, num: base.num};
  }
  return null;
}

function getFactLabel(fact: Fact): string {
  if (isDisproof(fact)) {
    return formatDisproofDescription(fact);
  }
  return describeFact(fact);
}

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
      position: sticky;
      top: -8px;
      margin-top: -8px;
      margin-left: -8px;
      margin-right: -8px;
      padding: 8px;
      background: var(--gd);
      z-index: 10;
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 1px solid var(--gc, #ccc);
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
    .disproof-panel {
      width: var(--board-size);
      max-height: 250px;
      overflow-y: auto;
      background: var(--gd);
      border: 1px solid var(--gc);
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
    .search-status {
      font-size: 0.85em;
      color: var(--multi-value-default);
      font-weight: normal;
    }
    .disproof-list {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .disproof-item {
      padding: 8px;
      border: 1px solid var(--gc);
      border-radius: 4px;
      background: var(--gf);
      transition: background-color 0.2s;
    }
    .disproof-item:hover {
      background: var(--gd);
    }
    .disproof-header {
      font-weight: 500;
      line-height: 1.3em;
    }
    .disproof-meta {
      margin-top: 4px;
      font-size: 0.85em;
      color: var(--text-color, #777);
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .disproof-actions {
      display: flex;
      gap: 8px;
      margin-top: 6px;
    }
    .disproof-btn {
      background: none;
      border: 1px solid var(--gc);
      color: var(--text-color);
      padding: 4px 10px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 0.85em;
      font-family: inherit;
      transition: background-color 0.2s;
    }
    .disproof-btn:hover {
      background-color: var(--hover-loc, #bdd4f9);
      color: #000;
    }
    .disproof-btn.apply {
      background-color: var(--multi-value-default);
      color: #000;
      border-color: var(--multi-value-default);
    }
    .disproof-btn.apply:hover {
      background-color: #0d0;
      border-color: #0d0;
    }
    .productivity-badge {
      font-weight: bold;
      color: var(--multi-value-default);
    }
  `;

  @property({attribute: false}) game: Game | null = null;
  @state() private playback: PlaybackGame | null = null;
  @state() private facts: readonly Fact[] = [];
  @state() private isPlayingForward = false;
  @state() private isPlayingBackward = false;
  @state() private selectedLoc: Loc | null = null;
  @state() private selectedFact: Fact | null = null;
  @state() private selectedLocFacts: Fact[] = [];
  @state() private disproofs: Disproof[] = [];
  @state() private searchStatus = '';
  @state() private isSearching = false;
  @state() private previewedDisproof: Disproof | null = null;
  @state() private previewStepIndex = -1;

  private productivityScores = new Map<string, number | 'loading'>();
  private searchToken = 0;

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
    this.interestingIndices = computeInterestingIndices(this.game.history);
  }

  private async updateFacts(keepSelection = false) {
    if (!keepSelection) {
      this.selectedLoc = null;
      this.selectedFact = null;
      this.selectedLocFacts = [];
    }
    if (!this.playback) return;
    const grid = this.playback.wrapper.game.asGrid();
    const gridString = grid.toFlatString();
    const elims = this.playback.getAppliedDisproofs();
    const constraints = getEliminationConstraints(elims);

    try {
      const response = await requestFactDeduction(
        gridString,
        5000,
        constraints,
      );
      this.facts = [...response.facts].sort(compareFacts);
    } catch (e) {
      console.error('Failed to deduce facts:', e);
      this.facts = [];
    }

    this.startDisproofSearch();
  }

  private startDisproofSearch() {
    this.searchToken++;
    const token = this.searchToken;

    this.disproofs = [];
    this.productivityScores.clear();
    this.searchStatus = '';
    this.isSearching = false;

    this.exitPreviewMode();

    if (!this.playback) return;
    if (this.isPlayingForward || this.isPlayingBackward) return;
    if (this.playback.wrapper.game.marks.asGrid().isSolved()) return;

    this.isSearching = true;
    this.runSequentialSearch(token);
  }

  private async runSequentialSearch(token: number) {
    if (token !== this.searchToken || !this.playback) return;

    const grid = this.playback.wrapper.game.asGrid();
    const gridString = grid.toFlatString();
    const solutions = this.playback.wrapper.game.sudoku.solutions.map(g =>
      g.toFlatString(),
    );

    this.searchStatus = 'Calculating productivity...';
    this.requestUpdate();

    try {
      const prodResult = await requestErroneousProductivityCalculation(
        gridString,
        solutions,
      );

      if (token !== this.searchToken) return;

      const candidates = prodResult.results;
      if (!candidates || candidates.length === 0) {
        this.isSearching = false;
        this.searchStatus = '';
        this.requestUpdate();
        return;
      }

      // We will check each candidate sequentially
      for (let i = 0; i < candidates.length; i++) {
        if (token !== this.searchToken) return;

        const cand = candidates[i];
        const percent = Math.round((i / candidates.length) * 100);
        this.searchStatus = `Searching disproofs... (${percent}% complete)`;
        this.requestUpdate();

        const elims = this.playback.getAppliedDisproofs();
        const constraints = getEliminationConstraints(elims);

        const complexity = this.game?.complexity;
        const isLunatic =
          complexity !== undefined && complexity >= wasm.Complexity.Lunatic;
        const useLongQueue = isLunatic;
        const maxTimeMs = isLunatic ? 2000 : 500;

        try {
          const response = await requestErroneousAssignmentDisproof(
            gridString,
            {loc: cand.loc, num: cand.num},
            solutions,
            constraints,
            maxTimeMs,
            useLongQueue,
          );

          if (token !== this.searchToken) return;

          if (response.disproof) {
            const newFact = response.disproof;
            if (
              !this.disproofs.some(
                f => shorthandFact(f) === shorthandFact(newFact),
              )
            ) {
              this.disproofs.push(newFact);
              const key = shorthandFact(newFact);
              this.productivityScores.set(key, cand.productivity);
              this.requestUpdate();
            }
          }
        } catch (e) {
          console.error(
            `Failed to disprove candidate at loc ${cand.loc} num ${cand.num}:`,
            e,
          );
        }

        // Yield control to browser
        await new Promise(resolve => window.setTimeout(resolve, 30));
      }

      if (token !== this.searchToken) return;
      this.isSearching = false;
      this.searchStatus = '';
      this.requestUpdate();
    } catch (e) {
      console.error('Error in sequential disproof search:', e);
      if (token === this.searchToken) {
        this.isSearching = false;
        this.searchStatus = 'Search failed';
        this.requestUpdate();
      }
    }
  }

  private enterPreview(disproof: Disproof) {
    this.clearPlayInterval();
    this.previewedDisproof = disproof;
    this.previewStepIndex = 0;
  }

  private exitPreviewMode() {
    this.previewedDisproof = null;
    this.previewStepIndex = -1;
  }

  private getPreviewTrailSteps(): Fact[] {
    if (!this.previewedDisproof) return [];
    const {antecedents, nub: finalNub} = flattenImplication(
      this.previewedDisproof,
    );
    return [...antecedents, finalNub];
  }

  private getPreviewHighlights(): Map<number, 'green' | 'yellow' | 'red'> {
    const highlights = new Map<number, 'green' | 'yellow' | 'red'>();
    if (!this.previewedDisproof) return highlights;

    const steps = this.getPreviewTrailSteps();
    const currentEff = Math.min(steps.length - 1, this.previewStepIndex);

    const setHighlight = (loc: number, color: 'green' | 'yellow' | 'red') => {
      const existing = highlights.get(loc);
      if (existing === 'green') return;
      if (existing === 'red' && color === 'yellow') return;
      highlights.set(loc, color);
    };

    for (let i = 0; i <= currentEff; i++) {
      const fact = steps[i];
      const isError =
        fact.type === 'Conflict' ||
        fact.type === 'NoNum' ||
        fact.type === 'NoLoc';

      if (fact.type === 'SpeculativeAssignment') {
        setHighlight(fact.loc, 'green');
      } else if (isError) {
        if (fact.type === 'Conflict') {
          for (const l of fact.locs) {
            setHighlight(l, 'red');
          }
        } else if (fact.type === 'NoNum') {
          setHighlight(fact.loc, 'red');
        } else if (fact.type === 'NoLoc') {
          for (const loc of Loc.ALL) {
            if (
              unitContains(fact.unit, loc) &&
              this.playback?.wrapper?.game?.isBlank(loc)
            ) {
              setHighlight(loc.index, 'red');
            }
          }
        }
      } else {
        const base = nub(fact);
        if (
          base.type === 'SingleLoc' ||
          base.type === 'SingleNum' ||
          base.type === 'SpeculativeAssignment'
        ) {
          setHighlight(base.loc, 'yellow');
        } else if (base.type === 'Conflict') {
          for (const l of base.locs) {
            setHighlight(l, 'yellow');
          }
        } else if (base.type === 'NoNum') {
          setHighlight(base.loc, 'yellow');
        } else if (base.type === 'Subset') {
          for (const l of base.locs) {
            setHighlight(l, 'yellow');
          }
        }
      }
    }
    return highlights;
  }

  private onPreviewScrub(e: Event) {
    const input = e.target as HTMLInputElement;
    this.previewStepIndex = parseInt(input.value, 10);
  }

  private applyDisproof(disproof: Disproof) {
    if (!this.playback) return;
    this.clearPlayInterval();

    const target = disproof.antecedents[0];
    const locObj = Loc.of(target.loc);
    if (locObj) {
      const currentNums =
        this.playback.wrapper.game.getNums(locObj) || new Set<number>();
      const updated = new Set(currentNums);
      updated.delete(target.num);
      if (updated.size > 0) {
        this.playback.addDeviation(new SetNums(locObj, updated));
      } else {
        this.playback.addDeviation(new ClearCell(locObj));
      }
    }

    this.playback.applyDisproof(disproof);

    this.selectedLoc = null;
    this.selectedFact = null;
    this.selectedLocFacts = [];
    this.exitPreviewMode();
    this.updateFacts();
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
    if (this.playback.deviations.length > 0) return;
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
    if (this.playback.deviations.length > 0) {
      this.playback.popDeviation();
      this.updateFacts();
    } else if (this.playback.index > 0) {
      this.playback.index--;
      this.updateFacts();
    } else if (fromInterval) {
      this.clearPlayInterval();
    }
  }

  private applySelectedFact(
    assignment: {loc: number; num: number},
    keepSelection = false,
  ) {
    if (!this.playback) return;
    this.clearPlayInterval();

    const gameLoc = Loc.of(assignment.loc);
    if (!gameLoc) return;

    const cmd = new SetNum(gameLoc, assignment.num);
    this.playback.addDeviation(cmd);

    if (!keepSelection) {
      this.selectedLoc = null;
      this.selectedFact = null;
      this.selectedLocFacts = [];
    }

    this.updateFacts(keepSelection);
  }

  private exitDigression() {
    if (this.playback) {
      this.playback.clearDeviations();
      this.updateFacts();
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
    if (this.selectedLoc) {
      const relevantFacts = this.computeRelevantFacts(this.selectedLoc);
      this.selectedLocFacts = relevantFacts;

      const isOnAlternatePath =
        this.playback && this.playback.deviations.length > 0;
      if (isOnAlternatePath) {
        const assignments = relevantFacts
          .map(getFactAssignment)
          .filter((a): a is {loc: number; num: number} => a !== null);
        const uniqueNums = Array.from(new Set(assignments.map(a => a.num)));
        if (uniqueNums.length === 1) {
          const firstAssignmentFact =
            relevantFacts.find(f => getFactAssignment(f) !== null) ??
            relevantFacts[0] ??
            null;
          this.selectedFact = firstAssignmentFact;
          this.applySelectedFact(
            {
              loc: this.selectedLoc.index,
              num: uniqueNums[0],
            },
            true,
          );
          return;
        }
      }

      this.selectedFact = relevantFacts.length > 0 ? relevantFacts[0] : null;
    } else {
      this.selectedFact = null;
      this.selectedLocFacts = [];
    }
  }

  private computeRelevantFacts(loc: Loc): Fact[] {
    const locIndex = loc.index;
    const localFacts = this.facts.filter(fact => {
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

    const assignsAndErrors: Fact[] = [];
    const eliminations: Fact[] = [];
    for (const fact of localFacts) {
      const base = nub(fact);
      if (base.type === 'Subset' || base.type === 'Overlap') {
        eliminations.push(fact);
      } else {
        assignsAndErrors.push(fact);
      }
    }

    const relevantDisproofs = this.disproofs.filter(fact => {
      return fact.antecedents[0].loc === locIndex;
    });

    const sortedDisproofs = relevantDisproofs.sort((a, b) => {
      const getProd = (f: Fact) => {
        const score = this.productivityScores.get(shorthandFact(f));
        return typeof score === 'number' ? score : -1;
      };
      const getLength = (f: Fact) => getTotalAntecedents(f);

      const prodA = getProd(a);
      const prodB = getProd(b);
      if (prodA !== prodB) {
        return prodB - prodA;
      }
      return getLength(a) - getLength(b);
    });

    return [...assignsAndErrors, ...sortedDisproofs, ...eliminations];
  }

  private readonly keydownHandler = (event: KeyboardEvent) => {
    if (!this.playback) return;
    if (event.target instanceof HTMLInputElement) return;

    if (this.previewedDisproof) {
      const steps = this.getPreviewTrailSteps();
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        this.previewStepIndex = Math.max(0, this.previewStepIndex - 1);
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        this.previewStepIndex = Math.min(
          steps.length - 1,
          this.previewStepIndex + 1,
        );
      } else if (event.key === 'Escape') {
        event.preventDefault();
        this.exitPreviewMode();
      }
      return;
    }

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

  protected override updated(changedProperties: Map<string, any>) {
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
    if (!this.playback) return html`<div>Loading...</div>`;

    const combinedHistory = [
      ...this.playback.history.slice(0, this.playback.index),
      ...this.playback.deviations,
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
        this.playback.deviations.length === 0 &&
        this.playback.index < this.playback.history.length
      ) ?
        this.playback.history[this.playback.index]
      : undefined;

    let effectiveSelectedFact = this.selectedFact;
    if (
      this.isPlayingForward &&
      nextCommand &&
      nextCommand.command.tag() === CommandTag.SET_NUM
    ) {
      const setNumCmd = nextCommand.command as SetNum;
      const locIndex = setNumCmd.loc.index;
      const num = setNumCmd.num;

      const matchingFact = this.facts.find(f => {
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
        .disproofs=${this.disproofs}
        .productivityScores=${this.productivityScores}
        .selectedLoc=${this.selectedLoc}
        .selectedFact=${this.previewedDisproof || effectiveSelectedFact}
        .actionLoc=${command && 'loc' in command.command ?
          (command.command as any).loc
        : null}
        .previewStepIndex=${this.previewStepIndex}
        .previewHighlights=${this.getPreviewHighlights()}
        .appliedDisproofs=${this.playback.getAppliedDisproofs()}
        @cell-selected=${this.onCellSelected}
      ></replay-view>

      <div id="middle-controls">
        ${this.previewedDisproof ?
          this.renderPreviewScrubber()
        : html`
            <input
              class="scrubber"
              type="range"
              min="0"
              max=${this.playback.history.length}
              .value=${this.playback.index.toString()}
              @input=${this.onScrub}
            />
            <div
              class="move-counter ${this.playback.deviations.length > 0 ?
                'digression-active'
              : ''}"
            >
              ${this.playback.deviations.length > 0 ?
                html`Move ${this.playback.index}
                  <span class="deviation-count"
                    >+${this.playback.deviations.length}</span
                  >
                  / ${this.playback.history.length}`
              : html`Move ${this.playback.index} /
                ${this.playback.history.length}`}
            </div>
            ${this.playback.deviations.length > 0 ?
              html`
                <button
                  class="reset-digression-button"
                  @click=${this.exitDigression}
                >
                  Exit Alternate Path
                </button>
              `
            : ''}
            <div class="playback-controls">
              <icon-button
                @click=${() => this.stepBackward()}
                iconName="navigate_before"
                iconSize="large"
                title="Step backward"
                ?disabled=${this.playback.index === 0 &&
                this.playback.deviations.length === 0}
              ></icon-button>
              <icon-button
                @click=${this.skipBackward}
                iconName="skip_previous"
                iconSize="large"
                title="Skip backward"
                ?disabled=${this.playback.index === 0 ||
                this.playback.deviations.length > 0}
              ></icon-button>
              <icon-button
                @click=${this.playBackward}
                iconName="play_arrow"
                ?flip=${true}
                iconSize="large"
                title="Play backward"
                ?disabled=${this.isPlayingBackward ||
                this.playback.index === 0 ||
                this.playback.deviations.length > 0}
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
                this.playback.index === this.playback.history.length ||
                this.playback.deviations.length > 0}
              ></icon-button>
              <icon-button
                @click=${this.skipForward}
                iconName="skip_next"
                iconSize="large"
                title="Skip forward"
                ?disabled=${this.playback.index ===
                  this.playback.history.length ||
                this.playback.deviations.length > 0}
              ></icon-button>
              <icon-button
                @click=${() => this.stepForward()}
                iconName="navigate_next"
                iconSize="large"
                title="Step forward"
                ?disabled=${this.playback.index ===
                  this.playback.history.length ||
                this.playback.deviations.length > 0}
              ></icon-button>
            </div>
          `}
      </div>

      ${this.playback.deviations.length === 0 ?
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
      ${this.renderSelectedFacts()} ${this.renderLogicalTrails()}
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
    const disproof =
      this.selectedFact && isDisproof(this.selectedFact) ?
        this.selectedFact
      : null;
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
                @click=${() => this.applySelectedFact(assignment)}
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
                  @click=${() => this.enterPreview(disproof!)}
                >
                  Detail View
                </button>
                <button
                  class="apply-fact-button"
                  style="background-color: var(--multi-value-default); color: #000;"
                  @click=${() => this.applyDisproof(disproof!)}
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
            if (isDisproof(fact)) {
              const score = this.productivityScores.get(shorthandFact(fact));
              if (typeof score === 'number') {
                label = `[Productivity: +${score}] ${label}`;
              } else if (score === 'loading') {
                label = `[Productivity: calculating...] ${label}`;
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
                  @change=${() => {
                    this.selectedFact = fact;
                  }}
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

  private renderPreviewScrubber() {
    const steps = this.getPreviewTrailSteps();
    return html`
      <input
        class="scrubber"
        type="range"
        min="0"
        max=${steps.length - 1}
        .value=${this.previewStepIndex.toString()}
        @input=${this.onPreviewScrub}
      />
      <div class="move-counter">
        Trail Step ${this.previewStepIndex + 1} / ${steps.length}
      </div>
      <button class="reset-digression-button" @click=${this.exitPreviewMode}>
        Exit Trail Preview
      </button>
      <div class="playback-controls">
        <icon-button
          @click=${() =>
            (this.previewStepIndex = Math.max(0, this.previewStepIndex - 1))}
          iconName="navigate_before"
          iconSize="large"
          title="Step backward"
          ?disabled=${this.previewStepIndex === 0}
        ></icon-button>
        <icon-button
          @click=${() =>
            (this.previewStepIndex = Math.min(
              steps.length - 1,
              this.previewStepIndex + 1,
            ))}
          iconName="navigate_next"
          iconSize="large"
          title="Step forward"
          ?disabled=${this.previewStepIndex === steps.length - 1}
        ></icon-button>
      </div>
    `;
  }

  private renderLogicalTrails() {
    if (this.previewedDisproof) {
      const steps = this.getPreviewTrailSteps();
      const currentFact =
        steps[Math.min(steps.length - 1, this.previewStepIndex)];
      return html`
        <div class="disproof-panel">
          <h3>Active Trail Preview</h3>
          <div style="font-weight: 500; margin-bottom: 8px;">
            ${formatDisproofDescription(this.previewedDisproof)}
          </div>
          <div
            style="padding: 10px; border: 1px dashed var(--gc); border-radius: 4px; background: var(--gd);"
          >
            <strong>Step ${this.previewStepIndex + 1}:</strong> ${describeFact(
              currentFact,
            )}
          </div>
        </div>
      `;
    }
    return '';
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'review-page': ReviewPage;
  }
}
