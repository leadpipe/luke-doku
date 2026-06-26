import {css, svg, TemplateResult} from 'lit';
import {customElement, property} from 'lit/decorators.js';
import {Loc} from '../game/loc';
import {ReplayInput} from './replay-input';
import {SudokuView} from './sudoku-view';

import type {Fact} from '../facts/Fact';
import type {Unit} from '../facts/Unit';
import {
  flattenImplication,
  getTotalAntecedents,
  nub,
  unitContains,
} from '../facts/utils';

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
      .constraint-line {
        stroke: var(--multi-value-negated, #f55);
        stroke-width: 2;
        stroke-dasharray: 4 4;
        opacity: 0.6;
        fill: none;
      }
    `,
  ];

  private readonly replayInput = new ReplayInput(this);

  @property({attribute: false}) facts?: readonly Fact[];
  @property({attribute: false}) selectedLoc: Loc | null = null;
  @property({attribute: false}) selectedFact: Fact | null = null;
  @property({attribute: false}) actionLoc: Loc | null = null;
  @property({type: Number}) previewStepIndex = -1;
  @property({attribute: false}) previewHighlights: Map<
    number,
    'green' | 'yellow' | 'red'
  > | null = null;
  @property({attribute: false}) appliedDisproofs?: readonly Fact[];

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

    for (const fact of this.appliedDisproofs) {
      if (
        fact.type === 'Implication' &&
        fact.antecedents.length > 0 &&
        fact.antecedents[0].type === 'SpeculativeAssignment'
      ) {
        const rootAsg = fact.antecedents[0] as {loc: number; num: number};
        eliminatedCandidates.add(`${rootAsg.loc}-${rootAsg.num}`);
      }
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

  private renderSelectedFactDetails(): TemplateResult[] {
    const answer: TemplateResult[] = [];
    if (!this.selectedFact) return answer;

    const {antecedents, nub: finalNub} = flattenImplication(this.selectedFact);

    let facts = [...antecedents, finalNub];
    if (this.previewStepIndex >= 0) {
      facts = facts.slice(0, this.previewStepIndex + 1);
    }
    const occupiedLocs = new Set<number>();
    const groups: TemplateResult[] = [];

    for (let i = facts.length - 1; i >= 0; i--) {
      const fact = facts[i];
      const parts = this.renderSingleFactDetails(fact, occupiedLocs);

      if (parts.length > 0) {
        const delayMs = i * 100;
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

    if (fact.type === 'SingleLoc') {
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
          // DO NOT ADD to occupiedLocs. Overlaps can appear together.
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
    }
    return answer;
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
    const {antecedents, nub: finalNub} = flattenImplication(this.selectedFact);
    let facts = [...antecedents, finalNub];
    if (this.previewStepIndex >= 0) {
      facts = facts.slice(0, this.previewStepIndex + 1);
    }

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

    if (!hasAssignmentsOrErrors) {
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
    }

    // Filter and sort assignment facts from least to most relevant (reverse of compareFacts)
    const assignmentFacts = this.facts.filter(fact => {
      if (this.selectedFact && fact !== this.selectedFact) return false;
      const base = nub(fact);
      return (
        base.type === 'SingleLoc' ||
        base.type === 'SingleNum' ||
        base.type === 'SpeculativeAssignment'
      );
    });

    assignmentFacts.sort((a, b) => {
      const typeRank = (fact: Fact) => {
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

    return answer;
  }

  protected override shouldSuppressNormalCellText(loc: Loc): boolean {
    if (!this.selectedFact) return false;
    const base = nub(this.selectedFact);
    if (
      base.type === 'SingleLoc' ||
      base.type === 'SingleNum' ||
      base.type === 'SpeculativeAssignment'
    ) {
      return base.loc === loc.index;
    }
    return false;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'replay-view': ReplayView;
  }
}
