import './events';
import './sudoku-input';

import {css, html, LitElement, PropertyValues, svg, TemplateResult} from 'lit';
import {customElement, property, query, state} from 'lit/decorators.js';
import {classMap} from 'lit/directives/class-map.js';
import {ref} from 'lit/directives/ref.js';
import * as wasm from 'luke-doku-rust';
import {Game, GameState} from '../game/game';
import {ReadonlyGrid, SymMatch} from '../game/grid';
import {Loc} from '../game/loc';
import {ReadonlyMarks} from '../game/marks';
import {PausePattern} from './pause-pattern';
import {
  cssPixels,
  DevicePixels,
  devicePixels,
  GridContainer,
  Point,
  Theme,
} from './types';
import {SudokuInput} from './sudoku-input';
import {ReadonlyTrails} from 'src/game/trails';

/**
 * The largest number of puzzle locations that don't conform to a symmetry
 * we'll still count as matching it.
 */
const MAX_NONCONFORMING_LOCS = 8;

/**
 * Displays a Sudoku puzzle, or an overlay that obscures it and illustrates the
 * symmetry of its clues.
 */
@customElement('sudoku-view')
export class SudokuView extends LitElement implements GridContainer {
  static override styles = [
    css`
      :host {
        display: flex;
        align-items: center;
        justify-content: center;
        background-color: var(--gf);
        user-select: none;
        -webkit-user-select: none;

        --block-border: #111;
        --hover-loc: #aecbfa;
        --hover-loc-text: #2222;
        --clue-fill: #222;
        --solution-fill: #222;
        --clock-fill: #f0f0f0e0;
        --target-fill: #e0e0e040;
        --selection-fill: #bdfe;
        --broken-fill: #f00;

        --gf: #fff;
        --gd: #ddd;
        --gc: #ccc;
        --ga: #aaa;
        --g9: #999;
        --g8: #888;
      }

      :host([theme='dark']) {
        --block-border: #eee;
        --hover-loc: #339;
        --hover-loc-text: #aaac;
        --clue-fill: #eee;
        --solution-fill: #ccc;
        --clock-fill: #202020e0;
        --target-fill: #30303040;
        --selection-fill: #337e;

        --gf: #000;
        --gd: #222;
        --gc: #333;
        --ga: #555;
        --g9: #666;
        --g8: #777;
      }

      .cell-border {
        stroke: #808080;
        stroke-width: 1;
      }

      .block-border {
        stroke: var(--block-border);
      }

      .hover-loc {
        fill: var(--hover-loc);
      }

      svg {
        overflow: hidden;
        touch-action: none;
      }

      svg * {
        pointer-events: none;
      }

      text {
        dominant-baseline: central;
        text-anchor: middle;
        user-select: none;
        -webkit-user-select: none;
      }
      text.hover-loc {
        font-weight: 400;
        font-family: 'Prompt';
        fill: var(--hover-loc-text);
      }
      text.clue {
        font-weight: 700;
        font-family: 'Merriweather Sans';
        fill: var(--clue-fill);
      }
      .solution,
      text.clock-text,
      text.trail {
        font-weight: 400;
        font-family: 'Prompt';
        fill: var(--solution-fill);
        color: var(--solution-fill);
      }
      text.trail.trailhead {
        font-weight: 700;
        font-style: italic;
      }
      text.solution, text.trail {
        opacity: 50%;
      }
      svg.trail-active text.trail.trail-index-0 {
        opacity: 100%;
      }
      svg:not(.trail-active) text.solution {
        opacity: 100%;
      }

      text.broken {
        fill: var(--broken-fill);
      }

      .clock {
        fill: var(--clock-fill);
      }
      .clock-selection {
        fill: var(--hover-loc);
      }
      .multi-input-target {
        fill: var(--target-fill);
        stroke: #808080;
        stroke-width: 1;
      }
      .multi-input-background {
        fill: var(--clock-fill);
        stroke: var(--clock-fill);
        stroke-linejoin: round;
      }
      .multi-input-num {
        fill: var(--clock-fill);
        stroke: #808080;
        stroke-width: 1;
      }
      .multi-input-num.selected {
        fill: var(--selection-fill);
      }
      .multi-input-num.hover-loc {
        fill: var(--hover-loc);
      }
      div.multi {
        display: flex;
        align-items: center;
        justify-content: center;
        height: 100%;
        padding: 0 10%;
      }
      div.solution {
        text-align: center;
        overflow-wrap: break-word;
        text-wrap: balance;
        line-height: 100%;
        width: 100%;
      }
      .solution.large {
        font-size: 0.9em;
      }
      .solution.medium {
        font-size: 0.75em;
      }
      .solution.small {
        font-size: 0.6em;
      }
      .solution.xsmall {
        font-size: 0.48em;
      }
    `,
  ];

  override render() {
    const {sideSize, cellSize, padding, game, gameState} = this;
    const cssSize = sideSize / devicePixelRatio + 2 * padding;
    const svgPadding = padding * devicePixelRatio;
    const compSize = sideSize + 2 * svgPadding;
    const showNumbers =
      gameState === GameState.RUNNING || gameState === GameState.COMPLETE;
    const pausePattern = showNumbers
      ? undefined
      : this.pausePatterns[this.overlayIndex];

    return html`
      <style>
        :host {
          font-size: ${cellSize * 0.65}px;
        }
      </style>
      <svg
        ${ref(this.svgChanged)}
        viewBox="${-svgPadding} ${-svgPadding} ${compSize} ${compSize}"
        width=${compSize}
        height=${compSize}
        style="width: ${cssSize}px; height: ${cssSize}px;"
        class=${game?.trails.active ? 'trail-active' : ''}
      >
        <style>
          .block-border {
            stroke-width: ${this.blockBorderWidth};
          }
          text.clock-text {
            font-size: ${cellSize * 0.3}px;
          }
          text.trail {
            font-size: ${cellSize * 0.4}px;
          }
          text.trail-index-0 {
            transform: translate(-${cellSize * 0.3}px, -${cellSize * 0.3}px);
          }
          text.trail-index-1 {
            transform: translate(${cellSize * 0.3}px, -${cellSize * 0.3}px);
          }
          text.trail-index-2 {
            transform: translate(-${cellSize * 0.3}px, ${cellSize * 0.3}px);
          }
          text.trail-index-3 {
            transform: translate(${cellSize * 0.3}px, ${cellSize * 0.3}px);
          }
        </style>
        ${pausePattern?.renderBackground() /*   --------------- */}
        ${this.renderGrid()}
        ${pausePattern?.renderPattern() /*      --------------- */}
        ${game && this.renderGameState(game, showNumbers) /* ------- */}
        ${this.input?.renderInGrid()}
      </svg>
      ${this.input?.renderMultiInputPopup()}
    `;
  }

  private renderGrid() {
    const {blockBorderWidth, blockSize, cellSize} = this;
    const size = 3 * blockSize + blockBorderWidth;

    const cellBorders = [];
    for (let i = 0; i < 3; ++i) {
      for (let j = 1; j < 3; ++j) {
        const cellEdge =
          blockBorderWidth + blockSize * i + cellSize * j + j + 0.5;
        cellBorders.push(`
          M 0,${cellEdge}
          h ${size}
          M ${cellEdge},0
          v ${size}
        `);
      }
    }

    const blockBorders = [];
    for (let i = 0; i <= 3; ++i) {
      const blkEdge = blockSize * i + blockBorderWidth / 2;
      blockBorders.push(`
        M 0,${blkEdge}
        h ${size}
        M ${blkEdge},0
        v ${size}
      `);
    }

    return svg`
      <path class="cell-border"
            d=${cellBorders.join(' ')} />
      <path class="block-border"
            d=${blockBorders.join(' ')} />
    `;
  }

  private renderGameState(game: Game, showNumbers: boolean) {
    if (!showNumbers) return;
    const brokenLocs = game.marks.asGrid().brokenLocs();
    const answer = this.input?.renderHoverLoc() ?? [];
    this.pushClues(game.marks, brokenLocs, answer);
    this.pushSolutionCells(game.marks, brokenLocs, answer);
    this.pushTrails(game.trails, answer);
    return answer;
  }

  private pushClues(
    marks: ReadonlyMarks,
    brokenLocs: Set<Loc>,
    answer: TemplateResult[],
  ): void {
    const {cellCenter} = this;
    for (const loc of Loc.ALL) {
      const clue = marks.getClue(loc);
      if (clue) {
        const [x, y] = cellCenter(loc);
        answer.push(svg`
          <text x=${x} y=${y} class="clue ${classMap({
          broken: brokenLocs.has(loc),
        })}">${clue}</text>`);
      }
    }
  }

  private pushSolutionCells(
    marks: ReadonlyMarks,
    brokenLocs: Set<Loc>,
    answer: TemplateResult[],
  ): void {
    const {cellCenter} = this;
    for (const loc of Loc.ALL) {
      const nums = marks.getNums(loc);
      if (!nums) continue;
      const [x, y] = cellCenter(loc);
      const {size} = nums;
      if (size === 1) {
        answer.push(svg`
          <text x=${x} y=${y} class="solution ${classMap({
          broken: brokenLocs.has(loc),
        })}">${nums.values().next().value}</text>`);
      } else {
        const {cellSize} = this;
        const cls =
          size > 5
            ? 'xsmall'
            : size > 3
            ? 'small'
            : size > 2
            ? 'medium'
            : 'large';
        answer.push(svg`
          <foreignObject
            x=${x - cellSize / 2} y=${y - cellSize / 2}
            width=${cellSize} height=${cellSize}>
            <div class="multi">
              <div class="solution ${cls}">${[...nums].join('')}</div>
            </div>
          </foreignObject>
        `);
      }
    }
  }

  private pushTrails(trails: ReadonlyTrails, answer: TemplateResult[]): void {
    const {cellCenter} = this;
    for (let i = 0, c = trails.numVisible; i < c; ++i) {
      const trail = trails.order[i];
      const classes = `trail trail-${trail.id} trail-index-${i}`;
      for (const loc of Loc.ALL) {
        const num = trail.get(loc);
        if (num) {
          const [x, y] = cellCenter(loc);
          const locClasses =
            loc === trail.trailhead ? `${classes} trailhead` : classes;
          answer.push(
            svg`<text x=${x} y=${y} class=${locClasses}>${num}</text>`,
          );
        }
      }
    }
  }

  /** Light or dark mode. */
  @property({reflect: true}) theme: Theme = 'light';

  /** Padding on all 4 sides of the Sudoku grid. */
  @property({converter: Number}) padding = cssPixels(0);

  /** Whether to accept input to the puzzle. */
  @property({type: Boolean}) interactive = false;

  /** The game's state.  Reflects `game.state`. */
  @property({attribute: false}) gameState: GameState = GameState.UNSTARTED;

  /** The game state.  */
  @property({attribute: false}) game: Game | null = null;
  private puzzle: ReadonlyGrid | null = null;

  /** The symmetry overlays that go along with this puzzle. */
  @state() private pausePatterns: PausePattern[] = [];

  /** Which overlay to display when the game is paused. */
  @state() private overlayIndex = 0;

  /**
   * The element that lets you assign more than one possible numeral to a
   * location.
   */
  @query('#multiInputPopup') multiInputPopup?: SVGElement;

  private resizing = false;
  private readonly resizeObserver = new ResizeObserver(async () => {
    if (!this.svg || this.resizing) return;
    this.resizing = true;
    setTimeout(() => {
      this.resizing = false;
      this.calcMetrics();
    }, 20);
  });

  override connectedCallback(): void {
    super.connectedCallback();
    this.resizeObserver.observe(this);
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.resizeObserver.unobserve(this);
  }

  // From the GridContainer interface.
  get svgElement() {
    return this.svg;
  }

  private svg!: SVGElement;
  private svgChanged(svg?: Element) {
    if (svg instanceof SVGElement) {
      this.svg = svg;
      this.calcMetrics();
    }
  }

  /** The input controller. */
  private input?: SudokuInput;

  override updated(changedProperties: PropertyValues<this>) {
    if (changedProperties.has('game') && this.game?.puzzle != this.puzzle) {
      // single = on purpose
      this.puzzle = this.game ? this.game.puzzle : null;
      this.pausePatterns = [];
      this.updateSymmetries();
    }
  }

  private updateSymmetries() {
    const {game, interactive} = this;
    if (game && !this.pausePatterns.length) {
      this.input = interactive ? new SudokuInput(this, game) : undefined;
      const {puzzle} = game;
      const matches: [wasm.Sym, SymMatch][] = puzzle.bestSymmetryMatches(
        MAX_NONCONFORMING_LOCS,
      );
      const seed = puzzle.toFlatString();
      this.pausePatterns = matches.map(([sym, match]) => {
        const random = new wasm.JsRandom(seed);
        try {
          return new PausePattern(sym, match, puzzle, this, random);
        } finally {
          random.free();
        }
      });
      this.overlayIndex = 0;
    }
  }

  /** The number of device pixels in the thick grid lines. */
  private blockBorderWidth = 0;
  /**
   * The number of device pixels in one block, including one block border, two
   * interior borders, and three cells.
   */
  private blockSize = 0;
  /** The number of device pixels in one side of the grid. */
  @state() sideSize = devicePixels(0);
  /** The number of device pixels on each side of a cell. */
  private _cellSize = devicePixels(0);

  /** The number of device pixels on each side of a cell. */
  get cellSize(): DevicePixels {
    return this._cellSize;
  }

  /**
   * The device-pixel offsets of cells' centers.  There are 9 offsets: they are
   * indexed by either row or col.
   */
  private centers: DevicePixels[] = [];

  readonly cellCenter: (loc: Loc) => Point = (loc: Loc) => {
    const {centers} = this;
    return [centers[loc.col], centers[loc.row]];
  };

  private calcMetrics() {
    const rect = this.getBoundingClientRect();
    let size = Math.min(rect.width, rect.height);
    this.style.setProperty('--size', `${size}px`);
    size -= 2 * this.padding;
    let sideSize = devicePixelRatio * size;
    const blockBorderWidth = (this.blockBorderWidth =
      sideSize < 150 ? 1 : sideSize < 200 ? 2 : 3);
    const cellSize = (this._cellSize = devicePixels(
      Math.floor((sideSize - 4 * blockBorderWidth - 6 * 1) / 9),
    ));
    const blockSize = (this.blockSize =
      3 * cellSize + 2 * 1 + 1 * blockBorderWidth);
    this.sideSize = devicePixels(blockBorderWidth + 3 * blockSize);

    const centers = [];
    const half = cellSize / 2;
    for (let i = 0; i < 3; ++i) {
      for (let j = 0; j < 3; ++j) {
        centers[i * 3 + j] = devicePixels(
          blockBorderWidth + blockSize * i + cellSize * j + j + half,
        );
      }
    }
    this.centers = centers;
  }
}
declare global {
  interface HTMLElementTagNameMap {
    'sudoku-view': SudokuView;
  }
}
