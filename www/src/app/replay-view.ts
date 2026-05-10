import {svg, TemplateResult} from 'lit';
import {customElement, property} from 'lit/decorators.js';
import {Loc} from '../game/loc';
import {ReplayInput} from './replay-input';
import {SudokuView} from './sudoku-view';

@customElement('replay-view')
export class ReplayView extends SudokuView {
  private readonly replayInput = new ReplayInput(this);

  @property({attribute: false}) facts?: any[];
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
      if ('SingleLoc' in fact) {
        const {loc, num} = fact.SingleLoc;
        const [x, y] = cellCenter(Loc.of(loc)!);
        answer.push(
          svg`<circle cx=${x} cy=${y} r=${this.cellSize * 0.4} fill="none" stroke="green" stroke-width="3" opacity="0.5"/>`,
        );
      } else if ('SingleNum' in fact) {
        const {loc, num} = fact.SingleNum;
        const [x, y] = cellCenter(Loc.of(loc)!);
        answer.push(
          svg`<circle cx=${x} cy=${y} r=${this.cellSize * 0.4} fill="none" stroke="blue" stroke-width="3" opacity="0.5"/>`,
        );
      } else if ('Subset' in fact) {
        const {locs} = fact.Subset;
        for (const loc of locs) {
          const [x, y] = cellCenter(Loc.of(loc)!);
          answer.push(
            svg`<rect x=${x - this.cellSize / 2} y=${y - this.cellSize / 2} width=${this.cellSize} height=${this.cellSize} fill="yellow" opacity="0.3"/>`,
          );
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
