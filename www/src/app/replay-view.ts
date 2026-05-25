import {css, svg, TemplateResult} from 'lit';
import {customElement, property} from 'lit/decorators.js';
import {Loc} from '../game/loc';
import {ReplayInput} from './replay-input';
import {SudokuView} from './sudoku-view';

import {nub} from '../facts/utils';
import type {Unit} from '../facts/Unit';
import type {Fact} from '../facts/Fact';

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
      .assignment-border {
        stroke: green;
        stroke-width: 3;
        opacity: 0.8;
        fill: none;
      }
      .error-border {
        stroke: red;
        stroke-width: 3;
        opacity: 0.8;
        fill: none;
      }
      @keyframes pulse-action {
        0% { opacity: 0.1; }
        50% { opacity: 0.4; }
        100% { opacity: 0.1; }
      }
      .action-highlight {
        fill: gold;
        animation: pulse-action 1.5s infinite;
      }
    `,
  ];

  private readonly replayInput = new ReplayInput(this);

  @property({attribute: false}) facts?: readonly Fact[];
  @property({attribute: false}) selectedLoc: Loc | null = null;
  @property({attribute: false}) actionLoc: Loc | null = null;

  protected override renderForeground() {
    return svg`
      <g id="action-highlight">${this.renderActionHighlight()}</g>
      <g id="selection">${this.renderSelectionHighlight()}</g>
      <g id="facts">${this.renderFacts()}</g>
    `;
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
        svg`<rect class="error-border" x=${x} y=${y} width=${width} height=${height} rx=${cellSize * 0.1}/>`
      );
    }

    const allLocs = new Set([...assignmentLocs, ...errorLocs]);
    for (const locIndex of allLocs) {
      const loc = Loc.of(locIndex);
      const [x, y] = cellCenter(loc);
      const isError = errorLocs.has(locIndex);
      const cssClass = isError ? 'error-border' : 'assignment-border';
      answer.push(
        svg`<rect class="${cssClass}" x=${x - cellSize / 2} y=${y - cellSize / 2} width=${cellSize} height=${cellSize} rx=${cellSize * 0.1}/>`
      );
    }

    for (const fact of this.facts) {
      if (fact.type === 'SingleLoc') {
        const {loc} = fact;
        const [x, y] = cellCenter(Loc.of(loc)!);
        answer.push(
          svg`<circle cx=${x} cy=${y} r=${this.cellSize * 0.4} fill="none" stroke="green" stroke-width="3" opacity="0.5"/>`,
        );
      } else if (fact.type === 'SingleNum') {
        const {loc} = fact;
        const [x, y] = cellCenter(Loc.of(loc)!);
        answer.push(
          svg`<circle cx=${x} cy=${y} r=${this.cellSize * 0.4} fill="none" stroke="blue" stroke-width="3" opacity="0.5"/>`,
        );
      } else if (fact.type === 'Subset') {
        const {locs, unit} = fact;
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
    return answer;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'replay-view': ReplayView;
  }
}
