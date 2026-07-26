import {ReactiveController, ReactiveControllerHost} from 'lit';
import {Disproof, isDisproof} from '../facts/disproof';
import type {Fact} from '../facts/Fact';
import {
  collectStepsWithContext,
  compareFacts,
  getVisibleFactsAtStep,
  nub,
  unitContains,
  type StepWithContext,
} from '../facts/utils';
import {CompletionState} from '../game/command';
import {ClearCell, SetNum, SetNums} from '../game/commands';
import {Game} from '../game/game';
import {Loc} from '../game/loc';
import {PlaybackGame} from '../game/playback';
import {ensureExhaustiveSwitch} from '../game/utils';
import {
  requestErroneousAssignmentDisproof,
  requestErroneousProductivityCalculation,
  requestFactDeduction,
} from '../system/puzzle-service';
import * as wasm from '../wasm';
import type {DisproofMetadata} from '../worker/worker-types';
import {
  computeInterestingIndices,
  getEliminationConstraints,
} from './review-utils';

export function getFactAssignment(
  fact: Fact | DisproofMetadata,
): {loc: number; num: number} | null {
  if (fact.type === 'DisproofMetadata') {
    return null;
  }
  const base = nub(fact as Fact);
  if (
    base.type === 'SingleLoc' ||
    base.type === 'SingleNum' ||
    base.type === 'SpeculativeAssignment'
  ) {
    return {loc: base.loc, num: base.num};
  }
  return null;
}

export class ReviewController implements ReactiveController {
  host: ReactiveControllerHost;

  private _game: Game | null = null;
  playback: PlaybackGame | null = null;

  facts: readonly Fact[] = [];
  isPlayingForward = false;
  isPlayingBackward = false;
  selectedLoc: Loc | null = null;
  selectedFact: Fact | DisproofMetadata | null = null;
  selectedLocFacts: (Fact | DisproofMetadata)[] = [];
  disproofs: DisproofMetadata[] = [];
  searchStatus = '';
  isSearching = false;
  previewedDisproof: Disproof | null = null;
  previewStepIndex = -1;

  productivityScores = new Map<string, number | 'loading'>();
  interestingIndices: number[] = [];

  private searchToken = 0;
  private playIntervalId: number | null = null;

  constructor(host: ReactiveControllerHost) {
    this.host = host;
    host.addController(this);
  }

  hostConnected() {}

  hostDisconnected() {
    this.clearPlayInterval();
  }

  get game(): Game | null {
    return this._game;
  }

  set game(newGame: Game | null) {
    if (this._game !== newGame) {
      this._game = newGame;
      if (newGame) {
        this.playback = new PlaybackGame(newGame.sudoku, newGame.history);
        this.computeInterestingIndices();
        if (newGame.completionState === CompletionState.SOLVED) {
          this.playback.index = 0;
        }
        this.updateFacts();
        // Start playback when arriving on the page
        this.playForward();
      } else {
        this.playback = null;
      }
      this.host.requestUpdate();
    }
  }

  private computeInterestingIndices() {
    if (!this.game || !this.playback) {
      this.interestingIndices = [];
      return;
    }
    this.interestingIndices = computeInterestingIndices(this.playback.history);
  }

  async updateFacts(keepSelection = false) {
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
    this.host.requestUpdate();

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
    this.host.requestUpdate();

    const elims = this.playback.getAppliedDisproofs();
    const constraints = getEliminationConstraints(elims);

    try {
      const prodResult = await requestErroneousProductivityCalculation(
        gridString,
        solutions,
        constraints,
      );

      if (token !== this.searchToken) return;

      const candidates = prodResult.results;
      if (!candidates || candidates.length === 0) {
        this.isSearching = false;
        this.searchStatus = '';
        this.host.requestUpdate();
        return;
      }

      const complexity = this.game?.complexity;
      const isLunatic =
        complexity !== undefined && complexity >= wasm.Complexity.Lunatic;

      const slowPassCandidates: (typeof candidates)[number][] = [];

      // Quick pass
      for (let i = 0; i < candidates.length; i++) {
        if (token !== this.searchToken) return;

        const cand = candidates[i];
        const percent = Math.round((i / candidates.length) * 100);
        this.searchStatus = `Searching disproofs (quick pass)... (${percent}% complete)`;
        this.host.requestUpdate();

        const useLongQueue = false;
        const maxTimeMs = 500;
        const maxDepth = 1;

        try {
          const response = await requestErroneousAssignmentDisproof(
            gridString,
            {loc: cand.loc, num: cand.num},
            solutions,
            constraints,
            maxTimeMs,
            useLongQueue,
            maxDepth,
          );

          if (token !== this.searchToken) return;

          if (response.metadata) {
            const newFact = response.metadata;
            if (!this.disproofs.some(f => f.shorthand === newFact.shorthand)) {
              this.disproofs = [...this.disproofs, newFact];
              const key = newFact.shorthand;
              const newScores = new Map(this.productivityScores);
              newScores.set(key, cand.productivity);
              this.productivityScores = newScores;
            }
          } else if (isLunatic) {
            slowPassCandidates.push(cand);
          }
        } catch (e) {
          console.error(
            `Failed to disprove candidate at loc ${cand.loc} num ${cand.num}:`,
            e,
          );
        }

        await new Promise(resolve => window.setTimeout(resolve, 30));
      }

      // Slow passes for Lunatic
      if (isLunatic && slowPassCandidates.length > 0) {
        let currentPassCandidates = [...slowPassCandidates];

        for (let passDepth = 2; passDepth <= 5; passDepth++) {
          if (currentPassCandidates.length === 0) break;

          let foundPositiveProductivity = false;
          const nextPassCandidates: (typeof candidates)[number][] = [];

          for (let i = 0; i < currentPassCandidates.length; i++) {
            if (token !== this.searchToken) return;

            const cand = currentPassCandidates[i];
            const percent = Math.round(
              (i / currentPassCandidates.length) * 100,
            );
            this.searchStatus = `Searching disproofs (depth ${passDepth})... (${percent}% complete)`;
            this.host.requestUpdate();

            const useLongQueue = true;
            const maxTimeMs = 2000;
            const maxDepth = passDepth;

            try {
              const response = await requestErroneousAssignmentDisproof(
                gridString,
                {loc: cand.loc, num: cand.num},
                solutions,
                constraints,
                maxTimeMs,
                useLongQueue,
                maxDepth,
              );

              if (token !== this.searchToken) return;

              if (response.metadata) {
                const newFact = response.metadata;
                if (
                  !this.disproofs.some(f => f.shorthand === newFact.shorthand)
                ) {
                  this.disproofs = [...this.disproofs, newFact];
                  const key = newFact.shorthand;
                  const newScores = new Map(this.productivityScores);
                  newScores.set(key, cand.productivity);
                  this.productivityScores = newScores;

                  if (cand.productivity > 0) {
                    foundPositiveProductivity = true;
                  }
                }
              } else {
                nextPassCandidates.push(cand);
              }
            } catch (e) {
              console.error(
                `Failed to disprove candidate at loc ${cand.loc} num ${cand.num} at depth ${passDepth}:`,
                e,
              );
            }

            await new Promise(resolve => window.setTimeout(resolve, 30));
          }

          if (foundPositiveProductivity) {
            break;
          }
          currentPassCandidates = nextPassCandidates;
        }
      }

      if (token !== this.searchToken) return;
      this.isSearching = false;
      this.searchStatus = '';
      this.host.requestUpdate();
    } catch (e) {
      console.error('Error in sequential disproof search:', e);
      if (token === this.searchToken) {
        this.isSearching = false;
        this.searchStatus = 'Search failed';
        this.host.requestUpdate();
      }
    }
  }

  private cachedPreviewTrailSteps: Fact[] = [];
  private cachedStepsWithContext: StepWithContext[] = [];
  private cachedPreviewHighlights: Map<number, 'green' | 'yellow' | 'red'> =
    new Map();
  private cachedPreviewVisibleFacts: Fact[] = [];

  private async fetchDisproofJson(
    metadata: DisproofMetadata,
  ): Promise<string | undefined> {
    if (metadata.json) return metadata.json;
    if (!this.playback) return undefined;

    this.searchStatus = 'Fetching full disproof details...';
    this.isSearching = true;
    this.host.requestUpdate();

    const grid = this.playback.wrapper.game.asGrid();
    const gridString = grid.toFlatString();
    const solutions = this.playback.wrapper.game.sudoku.solutions.map(g =>
      g.toFlatString(),
    );
    const elims = this.playback.getAppliedDisproofs();
    const constraints = getEliminationConstraints(elims);

    try {
      const response = await requestErroneousAssignmentDisproof(
        gridString,
        {loc: metadata.rootLoc, num: metadata.rootNum},
        solutions,
        constraints,
        5000, // maxTimeMs
        true, // useLongQueue so it doesn't block quick requests
        metadata.maxDepth, // maxDepth: Use exactly what we found it at
        true,
      );
      if (!response.metadata?.json) {
        console.error('Failed to re-fetch disproof details for:', metadata);
      }
      return response.metadata?.json;
    } finally {
      this.isSearching = false;
      this.searchStatus = '';
      this.host.requestUpdate();
    }
  }

  async enterPreview(metadata: DisproofMetadata) {
    const jsonStr = await this.fetchDisproofJson(metadata);
    if (!jsonStr) return;

    const disproof = JSON.parse(jsonStr) as Disproof;
    this.previewedDisproof = disproof;
    this.cachedStepsWithContext = collectStepsWithContext(
      this.previewedDisproof,
    );
    this.cachedPreviewTrailSteps = this.cachedStepsWithContext.map(s => s.fact);
    this.previewStepIndex = 0;
    this.updatePreviewHighlights();
    this.clearPlayInterval();
    this.host.requestUpdate();
  }

  exitPreviewMode = () => {
    if (this.previewedDisproof) {
      this.previewedDisproof = null;
      this.previewStepIndex = -1;
      this.cachedPreviewTrailSteps = [];
      this.cachedStepsWithContext = [];
      this.cachedPreviewHighlights.clear();
      this.cachedPreviewVisibleFacts = [];
      this.host.requestUpdate();
    }
  };

  getPreviewTrailSteps(): Fact[] {
    if (!this.previewedDisproof) return [];
    return this.cachedPreviewTrailSteps;
  }

  getPreviewStepsWithContext(): StepWithContext[] {
    if (!this.previewedDisproof) return [];
    return this.cachedStepsWithContext;
  }

  getPreviewVisibleFacts(): Fact[] {
    return this.cachedPreviewVisibleFacts;
  }

  getPreviewHighlights(): Map<number, 'green' | 'yellow' | 'red'> {
    if (this.previewedDisproof) {
      return this.cachedPreviewHighlights;
    }
    const highlights = new Map<number, 'green' | 'yellow' | 'red'>();

    const setHighlight = (loc: number, color: 'green' | 'yellow' | 'red') => {
      const existing = highlights.get(loc);
      if (existing === 'green') return;
      if (existing === 'red' && color === 'yellow') return;
      highlights.set(loc, color);
    };

    const applyErrorHighlights = (err: Fact) => {
      if (err.type === 'Conflict') {
        for (const l of err.locs) {
          setHighlight(l, 'red');
        }
      } else if (err.type === 'NoNum') {
        setHighlight(err.loc, 'red');
      } else if (err.type === 'NoLoc') {
        for (const loc of Loc.ALL) {
          if (
            unitContains(err.unit, loc) &&
            this.playback?.wrapper?.game?.isBlank(loc)
          ) {
            setHighlight(loc.index, 'red');
          }
        }
      }
    };

    if (
      this.selectedFact &&
      'type' in this.selectedFact &&
      this.selectedFact.type === 'DisproofMetadata'
    ) {
      setHighlight(this.selectedFact.rootLoc, 'green');
      if (this.selectedFact.errorFact) {
        applyErrorHighlights(this.selectedFact.errorFact);
      }
    } else if (this.selectedFact && isDisproof(this.selectedFact)) {
      setHighlight(this.selectedFact.antecedents[0].loc, 'green');
      applyErrorHighlights(nub(this.selectedFact));
    } else if (this.selectedFact) {
      const base = nub(this.selectedFact as Fact);
      if (base.type === 'SpeculativeAssignment') {
        setHighlight(base.loc, 'green');
      }
    }
    return highlights;
  }

  private updatePreviewHighlights() {
    if (!this.previewedDisproof) {
      this.cachedPreviewHighlights.clear();
      return;
    }

    const highlights = new Map<number, 'green' | 'yellow' | 'red'>();
    const setHighlight = (loc: number, color: 'green' | 'yellow' | 'red') => {
      const existing = highlights.get(loc);
      if (existing === 'green') return;
      if (existing === 'red' && color === 'yellow') return;
      highlights.set(loc, color);
    };

    const visibleFacts = getVisibleFactsAtStep(
      this.cachedStepsWithContext,
      this.previewStepIndex,
    );
    this.cachedPreviewVisibleFacts = visibleFacts;

    for (const fact of visibleFacts) {
      if (isDisproof(fact)) {
        setHighlight(fact.antecedents[0].loc, 'yellow');
        continue;
      }

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
    this.cachedPreviewHighlights = highlights;
  }

  setPreviewStepIndex(index: number) {
    this.previewStepIndex = index;
    this.updatePreviewHighlights();
    this.host.requestUpdate();
  }

  applyDisproof(metadata: DisproofMetadata) {
    if (!this.playback) return;
    this.clearPlayInterval();

    const locObj = Loc.of(metadata.rootLoc);
    if (locObj) {
      const currentNums =
        this.playback.wrapper.game.getNums(locObj) || new Set<number>();
      const updated = new Set(currentNums);
      updated.delete(metadata.rootNum);
      if (updated.size > 0) {
        this.playback.addDeviation(new SetNums(locObj, updated));
      } else {
        this.playback.addDeviation(new ClearCell(locObj));
      }
    }

    const fakeDisproof: Disproof = {
      type: 'Implication',
      antecedents: [
        {
          type: 'SpeculativeAssignment',
          loc: metadata.rootLoc,
          num: metadata.rootNum,
        },
      ],
      consequent: {
        type: 'Conflict',
        num: metadata.rootNum,
        unit: {type: 'Row', id: 0},
        locs: [],
      },
    };
    this.playback.applyDisproof(fakeDisproof);

    this.selectedLoc = null;
    this.selectedFact = null;
    this.selectedLocFacts = [];
    this.exitPreviewMode();
    this.updateFacts();
  }

  clearPlayInterval() {
    if (this.playIntervalId !== null) {
      window.clearInterval(this.playIntervalId);
      this.playIntervalId = null;
    }
    this.isPlayingForward = false;
    this.isPlayingBackward = false;
    this.host.requestUpdate();
  }

  playForward() {
    this.clearPlayInterval();
    this.isPlayingForward = true;
    this.playIntervalId = window.setInterval(() => this.stepForward(true), 500);
    this.host.requestUpdate();
  }

  playBackward() {
    this.clearPlayInterval();
    this.isPlayingBackward = true;
    this.playIntervalId = window.setInterval(
      () => this.stepBackward(true),
      500,
    );
    this.host.requestUpdate();
  }

  stepForward(fromInterval = false) {
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

  stepBackward(fromInterval = false) {
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

  applySelectedFact(
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

  exitDigression() {
    if (this.playback) {
      this.playback.clearDeviations();
      this.updateFacts();
    }
  }

  skipForward() {
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

  skipBackward() {
    this.clearPlayInterval();
    if (!this.playback) return;
    const reversed = [...this.interestingIndices].reverse();
    const prevIdx = reversed.find(idx => idx < this.playback!.index);
    if (prevIdx !== undefined) {
      this.playback.index = prevIdx;
      this.updateFacts();
    }
  }

  pause() {
    this.clearPlayInterval();
  }

  setPlaybackIndex(index: number) {
    this.clearPlayInterval();
    if (this.playback) {
      this.playback.index = index;
      this.updateFacts();
    }
  }

  onCellSelected(loc: Loc | null) {
    this.selectedLoc = loc;
    if (this.selectedLoc) {
      this.recomputeSelectedLocFacts();

      const isOnAlternatePath =
        this.playback && this.playback.deviations.length > 0;
      if (isOnAlternatePath) {
        const assignments = this.selectedLocFacts
          .map(getFactAssignment)
          .filter((a): a is {loc: number; num: number} => a !== null);
        const uniqueNums = Array.from(new Set(assignments.map(a => a.num)));
        if (uniqueNums.length === 1) {
          const firstAssignmentFact =
            this.selectedLocFacts.find(f => getFactAssignment(f) !== null) ??
            this.selectedLocFacts[0] ??
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

      this.selectedFact =
        this.selectedLocFacts.length > 0 ? this.selectedLocFacts[0] : null;
    } else {
      this.selectedFact = null;
      this.selectedLocFacts = [];
    }
    this.host.requestUpdate();
  }

  setSelectedFact(fact: Fact | DisproofMetadata) {
    this.selectedFact = fact;
    this.host.requestUpdate();
  }

  private recomputeSelectedLocFacts() {
    if (!this.selectedLoc) {
      this.selectedLocFacts = [];
      return;
    }
    const locIndex = this.selectedLoc.index;
    const localFacts = this.facts.filter(fact => {
      const base = nub(fact);
      switch (base.type) {
        case 'SingleLoc':
        case 'SingleNum':
        case 'SpeculativeAssignment':
        case 'NoNum':
          return base.loc === locIndex;
        case 'NoLoc':
          return unitContains(base.unit, this.selectedLoc!);
        case 'Conflict':
          return base.locs.includes(locIndex);
        case 'ConflictLoc':
          return base.loc === locIndex;
        case 'Overlap':
          return (
            unitContains(base.unit, this.selectedLoc!) &&
            unitContains(base.cross_unit, this.selectedLoc!)
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
      return fact.rootLoc === locIndex;
    });

    const sortedDisproofs = relevantDisproofs.sort((a, b) => {
      const getProd = (f: DisproofMetadata) => {
        const score = this.productivityScores.get(f.shorthand);
        return typeof score === 'number' ? score : -1;
      };
      const getLength = (f: DisproofMetadata) => f.totalAntecedents;

      const prodA = getProd(a);
      const prodB = getProd(b);
      if (prodA !== prodB) {
        return prodB - prodA;
      }
      return getLength(a) - getLength(b);
    });

    this.selectedLocFacts = [
      ...assignsAndErrors,
      ...sortedDisproofs,
      ...eliminations,
    ];
    this.host.requestUpdate();
  }
}
