import {css, svg, TemplateResult} from 'lit';
import {customElement, property} from 'lit/decorators.js';
import {Loc} from '../game/loc';
import {ReplayInput} from './replay-input';
import {SudokuView} from './sudoku-view';

import type {Fact} from '../facts/Fact';
import type {Unit} from '../facts/Unit';
import {getTotalAntecedents, nub, unitContains} from '../facts/utils';

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
    `,
  ];

  private readonly replayInput = new ReplayInput(this);

  @property({attribute: false}) facts?: readonly Fact[];
  @property({attribute: false}) selectedLoc: Loc | null = null;
  @property({attribute: false}) selectedFact: Fact | null = null;
  @property({attribute: false}) actionLoc: Loc | null = null;

  protected override renderForeground() {
    return svg`
      <g id="action-highlight">${this.renderActionHighlight()}</g>
      <g id="selection">${this.renderSelectionHighlight()}</g>
      <g id="facts">${this.renderFacts()}</g>
      <g id="fact-details">${this.renderSelectedFactDetails()}</g>
    `;
  }

  private renderSelectedFactDetails(): TemplateResult[] {
    const answer: TemplateResult[] = [];
    if (!this.selectedFact) return answer;

    const fact = nub(this.selectedFact);
    const {cellCenter} = this;

    if (fact.type === 'SingleLoc') {
      const [x, y] = cellCenter(Loc.of(fact.loc)!);
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
    } else if (fact.type === 'SingleNum') {
      const [x, y] = cellCenter(Loc.of(fact.loc)!);
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
    } else if (fact.type === 'SpeculativeAssignment') {
      const [x, y] = cellCenter(Loc.of(fact.loc)!);
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
    } else if (fact.type === 'NoNum') {
      const [x, y] = cellCenter(Loc.of(fact.loc)!);
      for (let i = 1; i <= 9; i++) {
        const angle = 2 * i * (Math.PI / 12);
        const textRadius = this.cellSize * 0.35;
        const numX = x + Math.sin(angle) * textRadius;
        const numY = y - Math.cos(angle) * textRadius;
        answer.push(
          svg`<text x=${numX} y=${numY} class="solution clock-text broken">x</text>`,
        );
      }
    } else if (fact.type === 'NoLoc') {
      for (const loc of Loc.ALL) {
        if (unitContains(fact.unit, loc) && this.isBlank(loc)) {
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
    } else if (fact.type === 'Subset') {
      for (const locIndex of fact.locs) {
        const loc = Loc.of(locIndex);
        const [x, y] = cellCenter(loc);
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
    } else if (fact.type === 'Conflict') {
      for (const locIndex of fact.locs) {
        const loc = Loc.of(locIndex);
        const [x, y] = cellCenter(loc);
        answer.push(
          svg`<text x=${x} y=${y} class="solution broken">${fact.num}</text>`,
        );
      }
    } else if (fact.type === 'Overlap') {
      const intersection = [...Loc.ALL].filter(
        loc =>
          unitContains(fact.unit, loc) && unitContains(fact.cross_unit, loc),
      );
      for (const loc of intersection) {
        if (!this.isBlank(loc)) continue;

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
    return answer;
  }

  protected override isFactDetailLoc(loc: Loc): boolean {
    if (!this.selectedFact) return false;
    const fact = nub(this.selectedFact);
    switch (fact.type) {
      case 'SingleLoc':
      case 'SingleNum':
      case 'SpeculativeAssignment':
      case 'NoNum':
        return loc.index === fact.loc;
      case 'NoLoc':
        return unitContains(fact.unit, loc);
      case 'Subset':
        return fact.locs.includes(loc.index);
      case 'Conflict':
        return fact.locs.includes(loc.index);
      case 'Overlap':
        return (
          unitContains(fact.unit, loc) && unitContains(fact.cross_unit, loc)
        );
      default:
        return false;
    }
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

    for (const fact of this.facts) {
      if (this.selectedFact && fact !== this.selectedFact) continue;
      const base = nub(fact);
      if (
        base.type === 'SingleLoc' ||
        base.type === 'SingleNum' ||
        base.type === 'SpeculativeAssignment'
      ) {
        if (fact !== this.selectedFact) {
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
      } else if (base.type === 'Subset' && !hasAssignmentsOrErrors) {
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
      } else if (
        base.type === 'Overlap' &&
        !hasAssignmentsOrErrors &&
        !hasSubsets
      ) {
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
    return answer;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'replay-view': ReplayView;
  }
}
