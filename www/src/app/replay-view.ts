import {css, svg, TemplateResult} from 'lit';
import {customElement, property} from 'lit/decorators.js';
import {Loc} from '../game/loc';
import {ReplayInput} from './replay-input';
import {SudokuView} from './sudoku-view';

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
    `,
  ];

  private readonly replayInput = new ReplayInput(this);

  @property({attribute: false}) facts?: readonly Fact[];
  @property({attribute: false}) selectedLoc: Loc | null = null;

  protected override renderForeground() {
    return svg`
      <g id="selection">${this.renderSelectionHighlight()}</g>
      <g id="facts">${this.renderFacts()}</g>
    `;
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

    const {cellCenter} = this;
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
