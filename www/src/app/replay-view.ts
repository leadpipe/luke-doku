import {css, svg, TemplateResult} from 'lit';
import {customElement, property} from 'lit/decorators.js';
import {Disproof, isDisproof} from '../facts/disproof';
import type {Fact} from '../facts/Fact';
import type {Unit} from '../facts/Unit';
import {
  flattenImplication,
  getTotalAntecedents,
  nub,
  unitContains,
} from '../facts/utils';
import {Loc} from '../game/loc';
import type {DisproofMetadata} from '../worker/worker-types';
import {ReplayInput} from './replay-input';
import {SudokuView} from './sudoku-view';

@customElement('replay-view')
export class ReplayView extends SudokuView {
  static override styles = [
    ...SudokuView.styles,
    css`
      .subset-line {
        stroke: gray;
        stroke-width: 3;
        opacity: 0.5;
        fill: none;
      }
      .overlap-line {
        stroke: #6688aa;
        stroke-width: 3;
        stroke-dasharray: 6 4;
        opacity: 0.5;
        fill: none;
      }
      .error-border {
        stroke: red;
        stroke-width: 3;
        opacity: 0.8;
        fill: none;
      }
      @keyframes pulse-action {
        0% {
          opacity: 0.1;
        }
        50% {
          opacity: 0.4;
        }
        100% {
          opacity: 0.1;
        }
      }
      .action-highlight {
        fill: gold;
        animation: pulse-action 1.5s infinite;
      }
      .fact-detail-text {
        fill: var(--multi-value-default) !important;
      }
      @keyframes fade-in {
        from {
          opacity: 0;
        }
        to {
          opacity: 1;
        }
      }
      @keyframes fade-in-ghosted {
        from {
          opacity: 0;
        }
        to {
          opacity: 0.6;
        }
      }
      .animated-fade {
        opacity: 0;
        animation: fade-in 0.3s ease-out forwards;
      }
      .animated-fade.ghosted {
        animation-name: fade-in-ghosted;
      }
      .ghosted {
        opacity: 0.6 !important;
      }
      .ghosted .subset-line,
      .ghosted .overlap-line,
      .ghosted .error-border {
        stroke-dasharray: 4 4;
      }
      .preview-green {
        fill: light-dark(#a1e8a1, #134613);
        opacity: 0.5;
      }
      .preview-yellow {
        fill: light-dark(#fff176, #5d5200);
        opacity: 0.5;
      }
      .preview-red {
        fill: light-dark(#e57373, #6b1515);
        opacity: 0.5;
      }
      /* Advanced facts styles */
      .fish-base-unit {
        fill: light-dark(rgba(66, 165, 245, 0.18), rgba(25, 118, 210, 0.28));
        stroke: light-dark(#42a5f5, #1e88e5);
        stroke-width: 1.5;
        stroke-dasharray: 6 3;
      }
      .fish-cover-unit {
        fill: light-dark(rgba(255, 202, 40, 0.18), rgba(245, 127, 23, 0.28));
        stroke: light-dark(#ffca28, #f57f17);
        stroke-width: 1.5;
        stroke-dasharray: 6 3;
      }
      .fish-node-glow {
        fill: light-dark(rgba(66, 165, 245, 0.25), rgba(25, 118, 210, 0.45));
        stroke: light-dark(#1976d2, #64b5f6);
        stroke-width: 2;
      }
      .fish-node-text {
        font-weight: bold;
        fill: light-dark(#0d47a1, #90caf9) !important;
      }
      .fish-fin-node {
        fill: light-dark(rgba(239, 83, 80, 0.25), rgba(198, 40, 40, 0.45));
        stroke: light-dark(#e53935, #ef5350);
        stroke-width: 2.5;
        animation: pulse-fin 1.3s infinite ease-in-out;
      }
      .fish-fin-text {
        font-weight: bold;
        fill: light-dark(#b71c1c, #ef9a9a) !important;
      }
      .fin-link-line {
        stroke: light-dark(#e53935, #ef5350);
        stroke-width: 2;
        stroke-dasharray: 4 4;
        animation: dash-flow 1.2s linear infinite;
      }
      .er-block-bg {
        fill: light-dark(rgba(171, 71, 188, 0.15), rgba(123, 31, 162, 0.25));
        stroke: light-dark(#ab47bc, #ba68c8);
        stroke-width: 2;
      }
      .er-line-highlight {
        fill: light-dark(rgba(171, 71, 188, 0.22), rgba(142, 36, 170, 0.35));
        stroke: light-dark(#8e24aa, #ce93d8);
        stroke-width: 1.5;
      }
      .strong-link-tether {
        stroke: light-dark(#00897b, #26a69a);
        stroke-width: 3;
        stroke-linecap: round;
      }
      .strong-link-node {
        fill: light-dark(rgba(0, 137, 123, 0.22), rgba(38, 166, 154, 0.4));
        stroke: light-dark(#00897b, #4db6ac);
        stroke-width: 2;
      }
      .strong-link-text {
        font-weight: bold;
        fill: light-dark(#004d40, #80cbc4) !important;
      }
      .skyscraper-base-unit {
        fill: light-dark(rgba(0, 172, 193, 0.16), rgba(0, 131, 143, 0.25));
        stroke: light-dark(#00acc1, #26c6da);
        stroke-width: 1.5;
        stroke-dasharray: 6 3;
      }
      .skyscraper-roof-badge {
        fill: light-dark(rgba(0, 172, 193, 0.25), rgba(0, 151, 167, 0.45));
        stroke: light-dark(#00838f, #4dd0e1);
        stroke-width: 2.5;
      }
      .skyscraper-roof-text {
        font-weight: bold;
        fill: light-dark(#006064, #80deea) !important;
      }
      .kite-block-bg {
        fill: light-dark(rgba(63, 81, 181, 0.15), rgba(48, 63, 159, 0.25));
        stroke: light-dark(#3f51b5, #7986cb);
        stroke-width: 2;
      }
      .kite-end-badge {
        fill: light-dark(rgba(63, 81, 181, 0.25), rgba(57, 73, 171, 0.45));
        stroke: light-dark(#303f9f, #7986cb);
        stroke-width: 2.5;
      }
      .kite-end-text {
        font-weight: bold;
        fill: light-dark(#1a237e, #9fa8da) !important;
      }
      .converging-sightline {
        stroke: light-dark(#e53935, #ef5350);
        stroke-width: 1.5;
        stroke-dasharray: 4 4;
        opacity: 0.8;
        animation: dash-flow 1.5s linear infinite;
      }
      .elimination-target-bg {
        fill: light-dark(rgba(244, 67, 54, 0.18), rgba(211, 47, 47, 0.3));
        stroke: light-dark(#e53935, #ef5350);
        stroke-width: 2;
      }
      .elimination-cross-center {
        font-size: 0.75em;
        font-weight: bold;
        fill: light-dark(#d32f2f, #ef5350);
        text-anchor: middle;
        dominant-baseline: central;
        opacity: 0.45;
      }
      .hint-advanced-node {
        fill: none;
        stroke: light-dark(#0288d1, #29b6f6);
        stroke-width: 2;
        stroke-dasharray: 3 3;
        opacity: 0.5;
      }
      .hint-tether-line {
        stroke: light-dark(#7b1fa2, #ab47bc);
        stroke-width: 2;
        stroke-dasharray: 4 4;
        opacity: 0.45;
      }
      @keyframes pulse-fin {
        0% { transform: scale(1); stroke-width: 2.5; }
        50% { transform: scale(1.05); stroke-width: 3.5; }
        100% { transform: scale(1); stroke-width: 2.5; }
      }
      @keyframes dash-flow {
        from { stroke-dashoffset: 16; }
        to { stroke-dashoffset: 0; }
      }
    `,
  ];

  private readonly replayInput = new ReplayInput(this);

  @property({attribute: false}) facts?: readonly Fact[];
  @property({attribute: false}) disproofs?: readonly DisproofMetadata[];
  @property({attribute: false}) productivityScores?: Map<
    string,
    number | 'loading'
  >;
  @property({attribute: false}) selectedLoc: Loc | null = null;
  @property({attribute: false}) selectedFact: Fact | DisproofMetadata | null =
    null;
  @property({attribute: false}) actionLoc: Loc | null = null;
  @property({type: Number}) previewStepIndex = -1;
  @property({attribute: false}) previewHighlights: Map<
    number,
    'green' | 'yellow' | 'red'
  > | null = null;
  @property({attribute: false}) appliedDisproofs?: readonly Disproof[];
  @property({attribute: false})
  previewVisibleFacts: Fact[] = [];

  protected override renderForeground() {
    return svg`
      <g id="preview-highlights">${this.renderPreviewHighlights()}</g>
      <g id="applied-disproofs">${this.renderAppliedDisproofs()}</g>
      <g id="action-highlight">${this.renderActionHighlight()}</g>
      <g id="selection">${this.renderSelectionHighlight()}</g>
      <g id="facts">${this.renderFacts()}</g>
      <g id="fact-details">${this.renderSelectedFactDetails()}</g>
    `;
  }

  private renderPreviewHighlights(): TemplateResult[] {
    const answer: TemplateResult[] = [];
    if (!this.previewHighlights) return answer;
    const {cellCenter, cellSize} = this;
    for (const [locIndex, color] of this.previewHighlights.entries()) {
      const loc = Loc.of(locIndex);
      if (!loc) continue;
      const [x, y] = cellCenter(loc);
      const className = `preview-${color}`;
      answer.push(
        svg`<rect class="${className}"
                  x=${x - cellSize / 2} 
                  y=${y - cellSize / 2} 
                  width=${cellSize} 
                  height=${cellSize} 
                  rx=${cellSize * 0.1}/>`,
      );
    }
    return answer;
  }

  private renderAppliedDisproofs(): TemplateResult[] {
    const answer: TemplateResult[] = [];
    if (!this.appliedDisproofs) return answer;

    const {cellCenter, cellSize} = this;
    const eliminatedCandidates = new Set<string>();

    for (const disproof of this.appliedDisproofs) {
      const rootAsg = disproof.antecedents[0];
      eliminatedCandidates.add(`${rootAsg.loc}-${rootAsg.num}`);
    }

    for (const item of eliminatedCandidates) {
      const [locIndexStr, numStr] = item.split('-');
      const locIndex = parseInt(locIndexStr, 10);
      const num = parseInt(numStr, 10);

      const loc = Loc.of(locIndex);
      if (!loc) continue;
      if (this.isBlank(loc) && this.getNum(loc) == null) {
        const [x, y] = cellCenter(loc);
        const angle = 2 * num * (Math.PI / 12);
        const textRadius = cellSize * 0.35;
        const numX = x + Math.sin(angle) * textRadius;
        const numY = y - Math.cos(angle) * textRadius;
        answer.push(
          svg`<text x=${numX} y=${numY} class="solution clock-text broken">x</text>`,
        );
      }
    }

    return answer;
  }

  private getActiveFactDetails(): Fact[] {
    const selectedFact = this.selectedFact;
    if (!selectedFact) return [];
    if ('type' in selectedFact && selectedFact.type === 'DisproofMetadata') {
      const facts: Fact[] = [
        {
          type: 'SpeculativeAssignment',
          loc: selectedFact.rootLoc,
          num: selectedFact.rootNum,
        },
      ];
      if (selectedFact.errorFact) {
        facts.push(selectedFact.errorFact);
      }
      return facts;
    }
    if (this.previewStepIndex >= 0 && isDisproof(selectedFact)) {
      return this.previewVisibleFacts;
    }
    const {antecedents, nub: finalNub} = flattenImplication(selectedFact);
    let facts = [...antecedents, finalNub];
    if (this.previewStepIndex >= 0) {
      facts = facts.slice(0, this.previewStepIndex + 1);
    } else if (isDisproof(selectedFact) && antecedents.length > 0) {
      facts = [antecedents[0], finalNub];
    }
    return facts;
  }

  private renderSelectedFactDetails(): TemplateResult[] {
    const answer: TemplateResult[] = [];
    if (!this.selectedFact) return answer;

    const facts = this.getActiveFactDetails();
    const occupiedLocs = new Set<number>();
    const groups: TemplateResult[] = [];

    for (let i = facts.length - 1; i >= 0; i--) {
      const fact = facts[i];
      const parts = this.renderSingleFactDetails(fact, occupiedLocs);

      if (parts.length > 0) {
        const delayMs = this.previewStepIndex >= 0 ? 0 : i * 100;
        const isGhosted = i < facts.length - 1;
        const classes = isGhosted ? 'animated-fade ghosted' : 'animated-fade';
        groups.push(
          svg`<g class="${classes}" style="animation-delay: ${delayMs}ms">${parts}</g>`,
        );
      }
    }

    return groups.reverse();
  }

  private renderSingleFactDetails(
    fact: Fact,
    occupiedLocs: Set<number>,
  ): TemplateResult[] {
    const answer: TemplateResult[] = [];
    const {cellCenter} = this;

    if (isDisproof(fact)) {
      const rootAsg = fact.antecedents[0];
      const loc = Loc.of(rootAsg.loc)!;
      if (loc && this.isBlank(loc) && this.getNum(loc) == null) {
        const [x, y] = cellCenter(loc);
        const angle = 2 * rootAsg.num * (Math.PI / 12);
        const textRadius = this.cellSize * 0.35;
        const numX = x + Math.sin(angle) * textRadius;
        const numY = y - Math.cos(angle) * textRadius;
        answer.push(
          svg`<text x=${numX} y=${numY} class="solution clock-text broken">x</text>`,
        );
      }
    } else if (fact.type === 'SingleLoc') {
      const loc = Loc.of(fact.loc)!;
      if (!occupiedLocs.has(loc.index)) {
        occupiedLocs.add(loc.index);
        const [x, y] = cellCenter(loc);
        answer.push(
          svg`<text x=${x} y=${y} class="solution fact-detail-text">${fact.num}</text>`,
        );
        if (fact.unit.type === 'Row') {
          answer.push(
            svg`<line class="subset-line" x1=${x - this.cellSize / 2} y1=${y} x2=${x + this.cellSize / 2} y2=${y} />`,
          );
        } else if (fact.unit.type === 'Col') {
          answer.push(
            svg`<line class="subset-line" x1=${x} y1=${y - this.cellSize / 2} x2=${x} y2=${y + this.cellSize / 2} />`,
          );
        } else if (fact.unit.type === 'Blk') {
          const size = this.cellSize / 2;
          answer.push(
            svg`<rect class="subset-line" x=${x - size / 2} y=${y - size / 2} width=${size} height=${size} />`,
          );
        }
      }
    } else if (fact.type === 'SingleNum') {
      const loc = Loc.of(fact.loc)!;
      if (!occupiedLocs.has(loc.index)) {
        occupiedLocs.add(loc.index);
        const [x, y] = cellCenter(loc);
        answer.push(
          svg`<text x=${x} y=${y} class="solution fact-detail-text">${fact.num}</text>`,
        );
        for (let i = 1; i <= 9; i++) {
          if (i === fact.num) continue;
          const angle = 2 * i * (Math.PI / 12);
          const textRadius = this.cellSize * 0.35;
          const numX = x + Math.sin(angle) * textRadius;
          const numY = y - Math.cos(angle) * textRadius;
          answer.push(
            svg`<text x=${numX} y=${numY} class="solution clock-text broken" opacity="0.3">x</text>`,
          );
        }
      }
    } else if (fact.type === 'SpeculativeAssignment') {
      const loc = Loc.of(fact.loc)!;
      if (!occupiedLocs.has(loc.index)) {
        occupiedLocs.add(loc.index);
        const [x, y] = cellCenter(loc);
        answer.push(
          svg`<text x=${x} y=${y} class="solution fact-detail-text">${fact.num}</text>`,
        );
        const textRadius = this.cellSize * 0.35;
        for (const angle of [
          Math.PI / 4,
          (3 * Math.PI) / 4,
          (5 * Math.PI) / 4,
          (7 * Math.PI) / 4,
        ]) {
          const qX = x + Math.sin(angle) * textRadius;
          const qY = y - Math.cos(angle) * textRadius;
          answer.push(
            svg`<text x=${qX} y=${qY} class="solution clock-text" style="opacity: 0.3">?</text>`,
          );
        }
      }
    } else if (fact.type === 'NoNum') {
      const loc = Loc.of(fact.loc)!;
      if (!occupiedLocs.has(loc.index)) {
        occupiedLocs.add(loc.index);
        const [x, y] = cellCenter(loc);
        for (let i = 1; i <= 9; i++) {
          const angle = 2 * i * (Math.PI / 12);
          const textRadius = this.cellSize * 0.35;
          const numX = x + Math.sin(angle) * textRadius;
          const numY = y - Math.cos(angle) * textRadius;
          answer.push(
            svg`<text x=${numX} y=${numY} class="solution clock-text broken">x</text>`,
          );
        }
      }
    } else if (fact.type === 'ConflictLoc') {
      const loc = Loc.of(fact.loc)!;
      if (!occupiedLocs.has(loc.index)) {
        occupiedLocs.add(loc.index);
        const [x, y] = cellCenter(loc);
        const nums = fact.nums.join(', ');

        // Error border around the cell
        const size = this.cellSize;
        answer.push(
          svg`<rect class="error-border" x=${x - size / 2} y=${y - size / 2} width=${size} height=${size} />`,
        );

        // Display multiple numbers stacked or smaller
        answer.push(
          svg`<text x=${x} y=${y} class="solution fact-detail-text" style="font-size: 0.5em" fill="red">${nums}</text>`,
        );
      }
    } else if (fact.type === 'NoLoc') {
      for (const loc of Loc.ALL) {
        if (unitContains(fact.unit, loc) && this.isBlank(loc)) {
          if (!occupiedLocs.has(loc.index)) {
            occupiedLocs.add(loc.index);
            const [x, y] = cellCenter(loc);
            if (fact.unit.type === 'Row') {
              answer.push(
                svg`<line class="subset-line" x1=${x - this.cellSize / 2} y1=${y} x2=${x + this.cellSize / 2} y2=${y} />`,
              );
            } else if (fact.unit.type === 'Col') {
              answer.push(
                svg`<line class="subset-line" x1=${x} y1=${y - this.cellSize / 2} x2=${x} y2=${y + this.cellSize / 2} />`,
              );
            } else if (fact.unit.type === 'Blk') {
              const size = this.cellSize / 2;
              answer.push(
                svg`<rect class="subset-line" x=${x - size / 2} y=${y - size / 2} width=${size} height=${size} />`,
              );
            }
            const angle = 2 * fact.num * (Math.PI / 12);
            const textRadius = this.cellSize * 0.35;
            const numX = x + Math.sin(angle) * textRadius;
            const numY = y - Math.cos(angle) * textRadius;
            answer.push(
              svg`<text x=${numX} y=${numY} class="solution clock-text broken">x</text>`,
            );
          }
        }
      }
    } else if (fact.type === 'Subset') {
      for (const locIndex of fact.locs) {
        if (!occupiedLocs.has(locIndex)) {
          occupiedLocs.add(locIndex);
          const loc = Loc.of(locIndex);
          const [x, y] = cellCenter(loc);

          if (fact.unit.type === 'Row') {
            answer.push(
              svg`<line class="subset-line" x1=${x - this.cellSize / 2} y1=${y} x2=${x + this.cellSize / 2} y2=${y} />`,
            );
          } else if (fact.unit.type === 'Col') {
            answer.push(
              svg`<line class="subset-line" x1=${x} y1=${y - this.cellSize / 2} x2=${x} y2=${y + this.cellSize / 2} />`,
            );
          } else if (fact.unit.type === 'Blk') {
            const size = this.cellSize / 2;
            answer.push(
              svg`<rect class="subset-line" x=${x - size / 2} y=${y - size / 2} width=${size} height=${size} />`,
            );
          }

          this.pushMultiValueCell(
            new Set(fact.nums),
            x,
            y,
            false,
            false,
            false,
            () => ({'default-result': true}),
            answer,
          );
        }
      }
    } else if (fact.type === 'Conflict') {
      for (const locIndex of fact.locs) {
        if (!occupiedLocs.has(locIndex)) {
          occupiedLocs.add(locIndex);
          const loc = Loc.of(locIndex);
          const [x, y] = cellCenter(loc);
          answer.push(
            svg`<text x=${x} y=${y} class="solution broken">${fact.num}</text>`,
          );
        }
      }
    } else if (fact.type === 'Overlap') {
      const intersection = [...Loc.ALL].filter(
        loc =>
          unitContains(fact.unit, loc) && unitContains(fact.cross_unit, loc),
      );
      for (const loc of intersection) {
        if (!this.isBlank(loc)) continue;
        if (!occupiedLocs.has(loc.index)) {
          occupiedLocs.add(loc.index);
          const [x, y] = cellCenter(loc);

          if (fact.unit.type === 'Row') {
            answer.push(
              svg`<line class="subset-line" x1=${x - this.cellSize / 2} y1=${y} x2=${x + this.cellSize / 2} y2=${y} />`,
            );
          } else if (fact.unit.type === 'Col') {
            answer.push(
              svg`<line class="subset-line" x1=${x} y1=${y - this.cellSize / 2} x2=${x} y2=${y + this.cellSize / 2} />`,
            );
          } else if (fact.unit.type === 'Blk') {
            const size = this.cellSize / 2;
            answer.push(
              svg`<rect class="subset-line" x=${x - size / 2} y=${y - size / 2} width=${size} height=${size} />`,
            );
          }

          const angle = 2 * fact.num * (Math.PI / 12);
          const textRadius = this.cellSize * 0.35;
          const numX = x + Math.sin(angle) * textRadius;
          const numY = y - Math.cos(angle) * textRadius;
          answer.push(
            svg`<text x=${numX} y=${numY} class="solution clock-text fact-detail-text">${fact.num}</text>`,
          );
        }
      }
    } else if (fact.type === 'Fish') {
      const nodeOrigins: [number, number][] = [];

      // Base Units (defining lines)
      for (const unit of fact.base_units) {
        const {x, y, width, height} = this.getUnitRect(unit);
        answer.push(
          svg`<rect class="fish-base-unit" x=${x} y=${y} width=${width} height=${height} rx=${this.cellSize * 0.12} />`,
        );
      }

      // Cover Units (intersecting lines)
      for (const unit of fact.cover_units) {
        const {x, y, width, height} = this.getUnitRect(unit);
        answer.push(
          svg`<rect class="fish-cover-unit" x=${x} y=${y} width=${width} height=${height} rx=${this.cellSize * 0.12} />`,
        );
      }

      // Intersection Nodes
      for (const base of fact.base_units) {
        for (const cover of fact.cover_units) {
          const r = base.type === 'Row' ? base.id : cover.id;
          const c = base.type === 'Col' ? base.id : cover.id;
          const loc = Loc.of(r, c);
          if (!loc) continue;
          if (!occupiedLocs.has(loc.index)) {
            occupiedLocs.add(loc.index);
            nodeOrigins.push(cellCenter(loc));
            answer.push(
              ...this.renderNodeBadge(
                fact.num,
                loc,
                'fish-node-glow',
                'solution fact-detail-text fish-node-text',
              ),
            );
          }
        }
      }

      // Fin Nodes (if finned / sashimi)
      const finOrigins: [number, number][] = [];
      for (const finIndex of fact.finned_locs) {
        const loc = Loc.of(finIndex);
        if (!loc) continue;
        if (!occupiedLocs.has(loc.index)) {
          occupiedLocs.add(loc.index);
          const pt = cellCenter(loc);
          finOrigins.push(pt);
          answer.push(
            ...this.renderNodeBadge(
              fact.num,
              loc,
              'fish-fin-node',
              'solution fact-detail-text fish-fin-text',
            ),
          );
        }
      }

      // Fin logic links connecting fins to target elimination cells
      for (const [fx, fy] of finOrigins) {
        for (const elimIndex of fact.elimination_locs) {
          const elimLoc = Loc.of(elimIndex);
          if (!elimLoc) continue;
          const [tx, ty] = cellCenter(elimLoc);
          answer.push(
            svg`<line class="fin-link-line" x1=${fx} y1=${fy} x2=${tx} y2=${ty} />`,
          );
        }
      }

      // Elimination Targets with laser sightlines
      const allOrigins = [...nodeOrigins, ...finOrigins];
      for (const elimIndex of fact.elimination_locs) {
        const loc = Loc.of(elimIndex);
        if (!loc) continue;
        if (!occupiedLocs.has(loc.index)) {
          occupiedLocs.add(loc.index);
          const [tx, ty] = cellCenter(loc);
          const relevantOrigins = allOrigins.filter(([ox, oy]) => {
            return Math.abs(ox - tx) < 1 || Math.abs(oy - ty) < 1;
          });
          answer.push(
            ...this.renderEliminationTarget(
              fact.num,
              loc,
              relevantOrigins.length > 0 ? relevantOrigins : allOrigins.slice(0, 2),
            ),
          );
        }
      }
    } else if (fact.type === 'EmptyRectangle') {
      // ER Block highlight
      const {x: bx, y: by, width: bw, height: bh} = this.getUnitRect(fact.block);
      answer.push(
        svg`<rect class="er-block-bg" x=${bx} y=${by} width=${bw} height=${bh} rx=${this.cellSize * 0.15} />`,
      );

      // ER cross line highlights through block
      const {y: ry, height: rh} = this.getUnitRect(fact.row);
      const {x: cx, width: cw} = this.getUnitRect(fact.col);
      answer.push(
        svg`<rect class="er-line-highlight" x=${bx} y=${ry} width=${bw} height=${rh} rx=${this.cellSize * 0.08} />`,
      );
      answer.push(
        svg`<rect class="er-line-highlight" x=${cx} y=${by} width=${cw} height=${bh} rx=${this.cellSize * 0.08} />`,
      );

      // ER Candidates within block cross
      for (const loc of Loc.ALL) {
        if (
          unitContains(fact.block, loc) &&
          (unitContains(fact.row, loc) || unitContains(fact.col, loc))
        ) {
          if (!occupiedLocs.has(loc.index)) {
            occupiedLocs.add(loc.index);
            const [lx, ly] = cellCenter(loc);
            const angle = 2 * fact.num * (Math.PI / 12);
            const textRadius = this.cellSize * 0.35;
            const numX = lx + Math.sin(angle) * textRadius;
            const numY = ly - Math.cos(angle) * textRadius;
            answer.push(
              svg`<text x=${numX} y=${numY} class="solution clock-text fact-detail-text">${fact.num}</text>`,
            );
          }
        }
      }

      // Conjugate Pair outside block
      const cpLocs = fact.conjugate_pair.map(i => Loc.of(i)!).filter(Boolean);
      if (cpLocs.length === 2) {
        const [cp1, cp2] = cpLocs;
        const [x1, y1] = cellCenter(cp1);
        const [x2, y2] = cellCenter(cp2);
        answer.push(
          svg`<line class="strong-link-tether" x1=${x1} y1=${y1} x2=${x2} y2=${y2} />`,
        );

        for (const cp of cpLocs) {
          if (!occupiedLocs.has(cp.index)) {
            occupiedLocs.add(cp.index);
            answer.push(
              ...this.renderNodeBadge(
                fact.num,
                cp,
                'strong-link-node',
                'solution fact-detail-text strong-link-text',
              ),
            );
          }
        }

        // Projections to elimination target
        for (const elimIndex of fact.elimination_locs) {
          const elimLoc = Loc.of(elimIndex);
          if (!elimLoc) continue;
          if (!occupiedLocs.has(elimLoc.index)) {
            occupiedLocs.add(elimLoc.index);
            const sharingCp = cpLocs.find(
              cp => cp.row === elimLoc.row || cp.col === elimLoc.col,
            );
            const origins: [number, number][] = [];
            if (sharingCp) {
              origins.push(cellCenter(sharingCp));
            }
            const erCenter = Loc.of(fact.row.id, fact.col.id);
            if (erCenter) {
              origins.push(cellCenter(erCenter));
            }
            answer.push(
              ...this.renderEliminationTarget(fact.num, elimLoc, origins),
            );
          }
        }
      }
    } else if (fact.type === 'Skyscraper') {
      // Base units highlight
      for (const unit of fact.base_units) {
        const {x, y, width, height} = this.getUnitRect(unit);
        answer.push(
          svg`<rect class="skyscraper-base-unit" x=${x} y=${y} width=${width} height=${height} rx=${this.cellSize * 0.12} />`,
        );
      }

      // Roof badges
      const roofLocs = fact.roof_locs.map(i => Loc.of(i)!).filter(Boolean);
      const roofPoints: [number, number][] = [];
      for (const roof of roofLocs) {
        if (!occupiedLocs.has(roof.index)) {
          occupiedLocs.add(roof.index);
          roofPoints.push(cellCenter(roof));
          answer.push(
            ...this.renderNodeBadge(
              fact.num,
              roof,
              'skyscraper-roof-badge',
              'solution fact-detail-text skyscraper-roof-text',
            ),
          );
        }
      }

      // Strong links along each base unit
      for (const unit of fact.base_units) {
        const roofInUnit = roofLocs.find(r => unitContains(unit, r));
        if (roofInUnit) {
          const otherUnit = fact.base_units.find(u => u !== unit);
          if (otherUnit) {
            const sharedBase = Loc.ALL.find(l => {
              if (!unitContains(unit, l) || l.index === roofInUnit.index)
                return false;
              return Loc.ALL.some(ol => {
                if (
                  !unitContains(otherUnit, ol) ||
                  fact.roof_locs.includes(ol.index)
                )
                  return false;
                return unit.type === 'Col' ? ol.row === l.row : ol.col === l.col;
              });
            });

            if (sharedBase) {
              const [rx, ry] = cellCenter(roofInUnit);
              const [bx, by] = cellCenter(sharedBase);
              answer.push(
                svg`<line class="strong-link-tether" x1=${rx} y1=${ry} x2=${bx} y2=${by} />`,
              );
              if (!occupiedLocs.has(sharedBase.index)) {
                occupiedLocs.add(sharedBase.index);
                answer.push(
                  ...this.renderNodeBadge(
                    fact.num,
                    sharedBase,
                    'strong-link-node',
                    'solution fact-detail-text strong-link-text',
                  ),
                );
              }
            }
          }
        }
      }

      // Elimination targets with converging sightlines from roofs
      for (const elimIndex of fact.elimination_locs) {
        const elimLoc = Loc.of(elimIndex);
        if (!elimLoc) continue;
        if (!occupiedLocs.has(elimLoc.index)) {
          occupiedLocs.add(elimLoc.index);
          answer.push(
            ...this.renderEliminationTarget(fact.num, elimLoc, roofPoints),
          );
        }
      }
    } else if (fact.type === 'TwoStringKite') {
      // Kite Block highlight
      const {x: bx, y: by, width: bw, height: bh} = this.getUnitRect(fact.block);
      answer.push(
        svg`<rect class="kite-block-bg" x=${bx} y=${by} width=${bw} height=${bh} rx=${this.cellSize * 0.15} />`,
      );

      // String ends
      const endLocs = fact.string_ends.map(i => Loc.of(i)!).filter(Boolean);
      const endPoints: [number, number][] = [];
      for (const end of endLocs) {
        if (!occupiedLocs.has(end.index)) {
          occupiedLocs.add(end.index);
          endPoints.push(cellCenter(end));
          answer.push(
            ...this.renderNodeBadge(
              fact.num,
              end,
              'kite-end-badge',
              'solution fact-detail-text kite-end-text',
            ),
          );
        }
      }

      // String tethers from corner block to string ends
      const rowEnd = endLocs.find(e => unitContains(fact.row, e));
      const colEnd = endLocs.find(e => unitContains(fact.col, e));
      const blockRowCells = Loc.ALL.filter(
        l => unitContains(fact.block, l) && unitContains(fact.row, l),
      );
      const blockColCells = Loc.ALL.filter(
        l => unitContains(fact.block, l) && unitContains(fact.col, l),
      );

      if (rowEnd && blockRowCells.length > 0) {
        const corner1 = blockRowCells[0];
        const [cx, cy] = cellCenter(corner1);
        const [ex, ey] = cellCenter(rowEnd);
        answer.push(
          svg`<line class="strong-link-tether" x1=${cx} y1=${cy} x2=${ex} y2=${ey} />`,
        );
        if (!occupiedLocs.has(corner1.index)) {
          occupiedLocs.add(corner1.index);
          answer.push(
            ...this.renderNodeBadge(
              fact.num,
              corner1,
              'strong-link-node',
              'solution fact-detail-text strong-link-text',
            ),
          );
        }
      }

      if (colEnd && blockColCells.length > 0) {
        const corner2 = blockColCells[0];
        const [cx, cy] = cellCenter(corner2);
        const [ex, ey] = cellCenter(colEnd);
        answer.push(
          svg`<line class="strong-link-tether" x1=${cx} y1=${cy} x2=${ex} y2=${ey} />`,
        );
        if (!occupiedLocs.has(corner2.index)) {
          occupiedLocs.add(corner2.index);
          answer.push(
            ...this.renderNodeBadge(
              fact.num,
              corner2,
              'strong-link-node',
              'solution fact-detail-text strong-link-text',
            ),
          );
        }
      }

      // Elimination targets with converging sightlines from string ends
      for (const elimIndex of fact.elimination_locs) {
        const elimLoc = Loc.of(elimIndex);
        if (!elimLoc) continue;
        if (!occupiedLocs.has(elimLoc.index)) {
          occupiedLocs.add(elimLoc.index);
          answer.push(
            ...this.renderEliminationTarget(fact.num, elimLoc, endPoints),
          );
        }
      }
    }
    return answer;
  }

  private getUnitRect(unit: Unit): {
    x: number;
    y: number;
    width: number;
    height: number;
  } {
    const {cellCenter, cellSize} = this;
    if (unit.type === 'Row') {
      const tl = Loc.of(unit.id, 0);
      const br = Loc.of(unit.id, 8);
      const [tlX, tlY] = cellCenter(tl);
      const [brX, brY] = cellCenter(br);
      const x = tlX - cellSize / 2;
      const y = tlY - cellSize / 2;
      return {x, y, width: brX + cellSize / 2 - x, height: cellSize};
    } else if (unit.type === 'Col') {
      const tl = Loc.of(0, unit.id);
      const br = Loc.of(8, unit.id);
      const [tlX, tlY] = cellCenter(tl);
      const [brX, brY] = cellCenter(br);
      const x = tlX - cellSize / 2;
      const y = tlY - cellSize / 2;
      return {x, y, width: cellSize, height: brY + cellSize / 2 - y};
    } else {
      const r0 = Math.floor(unit.id / 3) * 3;
      const c0 = (unit.id % 3) * 3;
      const tl = Loc.of(r0, c0);
      const br = Loc.of(r0 + 2, c0 + 2);
      const [tlX, tlY] = cellCenter(tl);
      const [brX, brY] = cellCenter(br);
      const x = tlX - cellSize / 2;
      const y = tlY - cellSize / 2;
      return {
        x,
        y,
        width: brX + cellSize / 2 - x,
        height: brY + cellSize / 2 - y,
      };
    }
  }

  private renderNodeBadge(
    num: number,
    loc: Loc,
    badgeClass: string,
    textClass: string,
  ): TemplateResult[] {
    const {cellCenter, cellSize} = this;
    const [x, y] = cellCenter(loc);
    const r = cellSize * 0.32;
    return [
      svg`<circle class="${badgeClass}" cx=${x} cy=${y} r=${r} />`,
      svg`<text class="${textClass}" x=${x} y=${y}>${num}</text>`,
    ];
  }

  private renderEliminationTarget(
    num: number,
    loc: Loc,
    sightlineOrigins: [number, number][] = [],
  ): TemplateResult[] {
    const results: TemplateResult[] = [];
    const {cellCenter, cellSize} = this;
    const [x, y] = cellCenter(loc);

    for (const [ox, oy] of sightlineOrigins) {
      results.push(
        svg`<line class="converging-sightline" x1=${ox} y1=${oy} x2=${x} y2=${y} />`,
      );
    }

    const size = cellSize * 0.88;
    results.push(
      svg`<rect class="elimination-target-bg" x=${x - size / 2} y=${y - size / 2} width=${size} height=${size} rx=${cellSize * 0.12} />`,
    );

    const angle = 2 * num * (Math.PI / 12);
    const textRadius = cellSize * 0.35;
    const numX = x + Math.sin(angle) * textRadius;
    const numY = y - Math.cos(angle) * textRadius;
    results.push(
      svg`<text x=${numX} y=${numY} class="solution clock-text broken">x</text>`,
    );
    results.push(
      svg`<text x=${x} y=${y} class="elimination-cross-center">✕</text>`,
    );

    return results;
  }

  protected override hasAssignmentIndication(loc: Loc): boolean {
    if (this.previewStepIndex >= 0) return false;
    if (!this.facts) return false;
    if (this.selectedFact) return false;

    return this.facts.some(fact => {
      const base = nub(fact);
      return (
        (base.type === 'SingleLoc' ||
          base.type === 'SingleNum' ||
          base.type === 'SpeculativeAssignment') &&
        base.loc === loc.index
      );
    });
  }

  protected override isFactDetailLoc(loc: Loc): boolean {
    if (!this.selectedFact) return false;
    const facts = this.getActiveFactDetails();

    for (const fact of facts) {
      switch (fact.type) {
        case 'SingleLoc':
        case 'SingleNum':
        case 'SpeculativeAssignment':
        case 'NoNum':
          if (loc.index === fact.loc) return true;
          break;
        case 'NoLoc':
          if (unitContains(fact.unit, loc)) return true;
          break;
        case 'Subset':
        case 'Conflict':
          if (fact.locs.includes(loc.index)) return true;
          break;
        case 'Overlap':
          if (
            unitContains(fact.unit, loc) &&
            unitContains(fact.cross_unit, loc)
          )
            return true;
          break;
        case 'Fish':
          if (
            fact.elimination_locs.includes(loc.index) ||
            fact.finned_locs.includes(loc.index) ||
            (fact.base_units.some(u => unitContains(u, loc)) &&
              fact.cover_units.some(u => unitContains(u, loc)))
          )
            return true;
          break;
        case 'EmptyRectangle':
          if (
            fact.elimination_locs.includes(loc.index) ||
            fact.conjugate_pair.includes(loc.index) ||
            (unitContains(fact.block, loc) &&
              (unitContains(fact.row, loc) || unitContains(fact.col, loc)))
          )
            return true;
          break;
        case 'Skyscraper':
          if (
            fact.elimination_locs.includes(loc.index) ||
            fact.roof_locs.includes(loc.index) ||
            fact.base_units.some(u => unitContains(u, loc))
          )
            return true;
          break;
        case 'TwoStringKite':
          if (
            fact.elimination_locs.includes(loc.index) ||
            fact.string_ends.includes(loc.index) ||
            unitContains(fact.block, loc)
          )
            return true;
          break;
        default:
          break;
      }
    }
    return false;
  }

  private renderActionHighlight(): TemplateResult | string {
    if (!this.actionLoc) return '';
    const {cellCenter, cellSize} = this;
    const [x, y] = cellCenter(this.actionLoc);
    return svg`<rect class="action-highlight" x=${x - cellSize / 2} y=${y - cellSize / 2} width=${cellSize} height=${cellSize}/>`;
  }

  private renderSelectionHighlight(): TemplateResult | string {
    if (!this.selectedLoc) return '';
    const {cellCenter, cellSize} = this;
    const [x, y] = cellCenter(this.selectedLoc);
    return svg`<rect class="hover-loc" x=${x - cellSize / 2} y=${y - cellSize / 2} width=${cellSize} height=${cellSize} opacity="0.5"/>`;
  }

  private renderFacts(): TemplateResult[] {
    const answer: TemplateResult[] = [];
    if (this.previewStepIndex >= 0) return answer;
    if (!this.facts) return answer;

    const {cellCenter, cellSize} = this;

    const assignmentLocs = new Set<number>();
    const errorLocs = new Set<number>();
    const errorUnits = new Map<string, Unit>();
    let hasSubsets = false;

    for (const fact of this.facts) {
      if (this.selectedFact && fact !== this.selectedFact) continue;
      if (isDisproof(fact)) continue; // Disproofs are drawn later, don't treat their consequents as grid errors
      const base = nub(fact);
      if (
        base.type === 'SingleLoc' ||
        base.type === 'SingleNum' ||
        base.type === 'SpeculativeAssignment'
      ) {
        assignmentLocs.add(base.loc);
      } else if (base.type === 'NoNum') {
        errorLocs.add(base.loc);
      } else if (base.type === 'Conflict' || base.type === 'NoLoc') {
        const {unit} = base;
        errorUnits.set(`${unit.type}-${unit.id}`, unit);
      } else if (base.type === 'Subset') {
        hasSubsets = true;
      }
    }

    for (const unit of errorUnits.values()) {
      let topLeftIndex = 0;
      let bottomRightIndex = 0;
      if (unit.type === 'Row') {
        topLeftIndex = Loc.of(unit.id, 0).index;
        bottomRightIndex = Loc.of(unit.id, 8).index;
      } else if (unit.type === 'Col') {
        topLeftIndex = Loc.of(0, unit.id).index;
        bottomRightIndex = Loc.of(8, unit.id).index;
      } else if (unit.type === 'Blk') {
        const r0 = Math.floor(unit.id / 3) * 3;
        const c0 = (unit.id % 3) * 3;
        topLeftIndex = Loc.of(r0, c0).index;
        bottomRightIndex = Loc.of(r0 + 2, c0 + 2).index;
      }

      const tl = Loc.of(topLeftIndex);
      const br = Loc.of(bottomRightIndex);
      const [tlX, tlY] = cellCenter(tl);
      const [brX, brY] = cellCenter(br);
      const x = tlX - cellSize / 2;
      const y = tlY - cellSize / 2;
      const width = brX + cellSize / 2 - x;
      const height = brY + cellSize / 2 - y;

      answer.push(
        svg`<rect class="error-border" x=${x} y=${y} width=${width} height=${height} rx=${cellSize * 0.1}/>`,
      );
    }

    for (const locIndex of errorLocs) {
      const loc = Loc.of(locIndex);
      const [x, y] = cellCenter(loc);
      answer.push(
        svg`<rect class="error-border" x=${x - cellSize / 2} y=${y - cellSize / 2} width=${cellSize} height=${cellSize} rx=${cellSize * 0.1}/>`,
      );
    }

    const hasAssignmentsOrErrors =
      assignmentLocs.size > 0 || errorLocs.size > 0 || errorUnits.size > 0;

    for (const fact of this.facts) {
      if (this.selectedFact && fact !== this.selectedFact) continue;
      const base = nub(fact);
      if (base.type === 'Subset') {
        const {locs, unit} = base;
        for (const loc of locs) {
          const [x, y] = cellCenter(Loc.of(loc)!);
          if (unit.type === 'Row') {
            answer.push(
              svg`<line class="subset-line" x1=${x - this.cellSize / 2} y1=${y} x2=${x + this.cellSize / 2} y2=${y} />`,
            );
          } else if (unit.type === 'Col') {
            answer.push(
              svg`<line class="subset-line" x1=${x} y1=${y - this.cellSize / 2} x2=${x} y2=${y + this.cellSize / 2} />`,
            );
          } else if (unit.type === 'Blk') {
            const size = this.cellSize / 2;
            answer.push(
              svg`<rect class="subset-line" x=${x - size / 2} y=${y - size / 2} width=${size} height=${size} />`,
            );
          }
        }
      }
    }
    if (!hasSubsets) {
      for (const fact of this.facts) {
        if (this.selectedFact && fact !== this.selectedFact) continue;
        const base = nub(fact);
        if (base.type === 'Overlap') {
          for (const loc of Loc.ALL) {
            if (
              !unitContains(base.unit, loc) ||
              !unitContains(base.cross_unit, loc)
            )
              continue;
            const [x, y] = cellCenter(loc);
            if (base.unit.type === 'Row') {
              answer.push(
                svg`<line class="overlap-line" x1=${x - this.cellSize / 2} y1=${y} x2=${x + this.cellSize / 2} y2=${y} />`,
              );
            } else if (base.unit.type === 'Col') {
              answer.push(
                svg`<line class="overlap-line" x1=${x} y1=${y - this.cellSize / 2} x2=${x} y2=${y + this.cellSize / 2} />`,
              );
            } else if (base.unit.type === 'Blk') {
              const size = this.cellSize / 2;
              answer.push(
                svg`<rect class="overlap-line" x=${x - size / 2} y=${y - size / 2} width=${size} height=${size} />`,
              );
            }
          }
        }
      }
    }

    if (!this.selectedFact) {
      for (const fact of this.facts) {
        const base = nub(fact);
        if (base.type === 'Fish') {
          for (const bu of base.base_units) {
            for (const cu of base.cover_units) {
              const r = bu.type === 'Row' ? bu.id : cu.id;
              const c = bu.type === 'Col' ? bu.id : cu.id;
              const loc = Loc.of(r, c);
              if (loc) {
                const [x, y] = cellCenter(loc);
                answer.push(
                  svg`<circle class="hint-advanced-node" cx=${x} cy=${y} r=${this.cellSize * 0.28} />`,
                );
              }
            }
          }
        } else if (base.type === 'EmptyRectangle') {
          const {x, y, width, height} = this.getUnitRect(base.block);
          answer.push(
            svg`<rect class="hint-tether-line" x=${x} y=${y} width=${width} height=${height} rx=${this.cellSize * 0.15} fill="none" />`,
          );
        } else if (base.type === 'Skyscraper') {
          const roofs = base.roof_locs.map(i => Loc.of(i)!).filter(Boolean);
          if (roofs.length === 2) {
            const [x1, y1] = cellCenter(roofs[0]);
            const [x2, y2] = cellCenter(roofs[1]);
            answer.push(
              svg`<line class="hint-tether-line" x1=${x1} y1=${y1} x2=${x2} y2=${y2} />`,
            );
          }
        } else if (base.type === 'TwoStringKite') {
          const ends = base.string_ends.map(i => Loc.of(i)!).filter(Boolean);
          if (ends.length === 2) {
            const [x1, y1] = cellCenter(ends[0]);
            const [x2, y2] = cellCenter(ends[1]);
            answer.push(
              svg`<line class="hint-tether-line" x1=${x1} y1=${y1} x2=${x2} y2=${y2} />`,
            );
          }
        }
      }
    }

    // Filter and sort assignment facts from least to most relevant (reverse of compareFacts)
    const assignmentFacts = this.facts.filter(fact => {
      if (this.selectedFact && fact !== this.selectedFact) return false;
      if (isDisproof(fact)) return true;
      const base = nub(fact);
      return (
        base.type === 'SingleLoc' ||
        base.type === 'SingleNum' ||
        base.type === 'SpeculativeAssignment'
      );
    });

    assignmentFacts.sort((a, b) => {
      const typeRank = (fact: Fact) => {
        if (isDisproof(fact)) return 0;
        const base = nub(fact);
        switch (base.type) {
          case 'SpeculativeAssignment':
            return 1;
          case 'SingleNum':
            return 2;
          case 'SingleLoc':
            return 3;
          default:
            return 0;
        }
      };
      const rankA = typeRank(a);
      const rankB = typeRank(b);
      if (rankA !== rankB) {
        return rankA - rankB;
      }
      return getTotalAntecedents(b) - getTotalAntecedents(a);
    });

    const mostRelevantByLoc = new Map<number, Fact>();
    for (const fact of assignmentFacts) {
      if (isDisproof(fact)) {
        mostRelevantByLoc.set(fact.antecedents[0].loc, fact);
        continue;
      }
      const base = nub(fact);
      if (
        base.type === 'SingleLoc' ||
        base.type === 'SingleNum' ||
        base.type === 'SpeculativeAssignment'
      ) {
        mostRelevantByLoc.set(base.loc, fact);
      }
    }

    for (const fact of mostRelevantByLoc.values()) {
      const base = nub(fact);
      if (
        (base.type === 'SingleLoc' ||
          base.type === 'SingleNum' ||
          base.type === 'SpeculativeAssignment') &&
        fact !== this.selectedFact
      ) {
        const {loc} = base;
        const [x, y] = cellCenter(Loc.of(loc)!);
        const color = base.type === 'SingleNum' ? 'blue' : 'green';
        const totalAntecedents = getTotalAntecedents(fact);
        const radius = Math.max(
          cellSize * 0.15,
          (cellSize * 0.4) / (1 + 0.2 * totalAntecedents),
        );
        answer.push(
          svg`<circle cx=${x} cy=${y} r=${radius} fill="none" stroke="${color}" stroke-width="3" opacity="0.5"/>`,
        );
      }
    }

    // Find the max productivity among disproofs
    let maxProductivity = -1;
    if (this.disproofs && this.productivityScores) {
      for (const fact of this.disproofs) {
        const score = this.productivityScores.get(fact.shorthand);
        if (typeof score === 'number' && score > maxProductivity) {
          maxProductivity = score;
        }
      }
    }

    // Collect disproofs to draw
    const disproofsToDraw: {
      fact: DisproofMetadata;
      locIndex: number;
      totalFacts: number;
    }[] = [];
    if (this.disproofs && this.productivityScores && maxProductivity >= 0) {
      for (const disproof of this.disproofs) {
        if (this.selectedFact && disproof !== this.selectedFact) continue;
        if (disproof === this.selectedFact) continue;

        const score = this.productivityScores.get(disproof.shorthand);
        if (typeof score === 'number' && score === maxProductivity) {
          const locIndex = disproof.rootLoc;
          if (!assignmentLocs.has(locIndex)) {
            disproofsToDraw.push({
              fact: disproof,
              locIndex,
              totalFacts: disproof.totalAntecedents,
            });
          }
        }
      }
    }

    // Find min and max trail length among those being rendered
    let minLen = Infinity;
    let maxLen = -Infinity;
    for (const d of disproofsToDraw) {
      if (d.totalFacts < minLen) minLen = d.totalFacts;
      if (d.totalFacts > maxLen) maxLen = d.totalFacts;
    }

    // Render diamonds for disproofs with the largest productivity using relative scaling
    for (const d of disproofsToDraw) {
      const [cx, cy] = cellCenter(Loc.of(d.locIndex)!);
      let r = cellSize * 0.4;
      if (maxLen > minLen) {
        const t = (d.totalFacts - minLen) / (maxLen - minLen);
        r = cellSize * (0.4 - 0.2 * t);
      }
      const pointsStr = `${cx},${cy - r} ${cx + r},${cy} ${cx},${cy + r} ${cx - r},${cy}`;
      answer.push(
        svg`<polygon points="${pointsStr}" fill="none" stroke="orange" stroke-width="3" opacity="0.6"/>`,
      );
    }

    return answer;
  }

  protected override shouldSuppressNormalCellText(loc: Loc): boolean {
    if (!this.selectedFact) return false;
    const facts = this.getActiveFactDetails();
    return facts.some(fact => {
      if (fact.type === 'SpeculativeAssignment') {
        return fact.loc === loc.index;
      }
      const base = nub(fact);
      return (
        (base.type === 'SingleLoc' ||
          base.type === 'SingleNum' ||
          base.type === 'SpeculativeAssignment') &&
        base.loc === loc.index
      );
    });
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'replay-view': ReplayView;
  }
}
