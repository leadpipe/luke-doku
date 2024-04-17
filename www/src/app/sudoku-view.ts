import './events';
import './sudoku-input';

import {css, html, LitElement, PropertyValues, svg} from 'lit';
import {customElement, property, query, state} from 'lit/decorators.js';
import {ref} from 'lit/directives/ref.js';
import * as wasm from 'luke-doku-rust';
import {PausePattern, WasmSymMatch} from './pause-pattern';
import {GridContainer, Point, Theme} from './types';
import {SudokuInput} from './sudoku-input';
import {Loc} from '../game/loc';
import {Game} from '../game/game';

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

        --block-border: #111;
        --hover-loc: #aecbfa;
        --hover-loc-text: #2222;
        --clue-fill: #222;
        --solution-fill: #222;
        --clock-fill: #f0f0f0e0;

        --gf: #fff;
        --gd: #ddd;
        --gc: #ccc;
        --ga: #aaa;
        --g9: #999;
        --g8: #888;
      }

      :host([theme='dark']) {
        --block-border: #eee;
        --hover-loc: #337;
        --hover-loc-text: #aaac;
        --clue-fill: #eee;
        --solution-fill: #ccc;
        --clock-fill: #202020e0;

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
      text.solution,
      text.clock-text {
        font-weight: 400;
        font-family: 'Prompt';
        fill: var(--solution-fill);
      }

      .clock {
        fill: var(--clock-fill);
      }
      .clock-selection {
        fill: var(--hover-loc);
      }
    `,
  ];

  override render() {
    const {sideSize, cellSize, padding, game} = this;
    const cssSize = sideSize / devicePixelRatio + 2 * padding;
    const svgPadding = padding * devicePixelRatio;
    const compSize = sideSize + 2 * svgPadding;
    const pausePattern = this.isPaused
      ? this.pausePatterns[this.overlayIndex!]
      : undefined;

    return html`
      <svg
        ${ref(this.svgChanged)}
        viewBox="${-svgPadding} ${-svgPadding} ${compSize} ${compSize}"
        width=${compSize}
        height=${compSize}
        style="width: ${cssSize}px; height: ${cssSize}px;"
      >
        <style>
          .block-border {
            stroke-width: ${this.blockBorderWidth};
          }
          text {
            font-size: ${cellSize * 0.65}px;
          }
          text.clock-text {
            font-size: ${cellSize * 0.3}px;
          }
        </style>
        ${pausePattern?.renderBackground() /*   --------------- */}
        ${this.renderGrid()}
        ${pausePattern?.renderPattern() /*      --------------- */}
        ${game && this.renderGameState(game) /* --------------- */}
        ${this.input?.renderInGrid()}
      </svg>
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

  private renderGameState(game: Game) {
    if (this.isPaused) return;
    const answer = this.input?.renderHoverLoc() ?? [];
    const {cellCenter} = this;
    for (const loc of Loc.ALL) {
      const clue = game.marks.getClue(loc);
      if (clue) {
        const [x, y] = cellCenter(loc);
        answer.push(svg`
          <text x=${x} y=${y} class="clue">${clue}</text>`);
      }
      const num = game.marks.getNum(loc);
      if (num) {
        const [x, y] = cellCenter(loc);
        answer.push(svg`
          <text x=${x} y=${y} class="solution">${num}</text>`);
      }
    }
    return answer;
  }

  /** Light or dark mode. */
  @property({reflect: true}) theme: Theme = 'light';

  /** Padding in CSS pixels on all 4 sides of the Sudoku grid. */
  @property({type: Number}) padding = 0;

  /** Whether to accept input to the puzzle. */
  @property({type: Boolean}) interactive = false;

  /** The puzzle we're displaying. Setting this will update `overlays`. */
  @property({attribute: false}) puzzle: wasm.Grid | null = null;

  /** The symmetry overlays that go along with this puzzle. */
  @state() private pausePatterns: PausePattern[] = [];

  /** The game state. */
  private game: Game | null = null;

  /** Which overlay to display, or null to display the puzzle. */
  @property({type: Number}) overlayIndex: number | null = null;

  /** The symmetry overlays that correspond to the current puzzle. */
  get overlays(): readonly PausePattern[] {
    return this.pausePatterns;
  }

  private readonly resizeObserver = new ResizeObserver(() => {
    if (!this.svg) return;
    this.calcMetrics();
  });

  override connectedCallback(): void {
    super.connectedCallback();
    this.resizeObserver.observe(this);
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.resizeObserver.unobserve(this);
  }

  get isPaused(): boolean {
    return this.overlayIndex !== null;
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
    if (changedProperties.has('puzzle')) {
      this.game = null;
      this.pausePatterns = [];
      this.updateGameAndSymmetries();
    }
  }

  private updateGameAndSymmetries() {
    const {puzzle, interactive} = this;
    if (puzzle && !this.pausePatterns.length) {
      this.game = new Game(puzzle);
      this.input = interactive ? new SudokuInput(this, this.game) : undefined;
      const matches: [wasm.Sym, WasmSymMatch][] = wasm.bestSymmetryMatches(
        puzzle,
        MAX_NONCONFORMING_LOCS,
      );
      this.pausePatterns = matches.map(([sym, match]) => {
        const random = new wasm.JsRandom(puzzle.toFlatString());
        try {
          return new PausePattern(sym, match, puzzle, this, random);
        } finally {
          random.free();
        }
      });
      if (
        this.overlayIndex !== null &&
        this.overlayIndex >= this.pausePatterns.length
      ) {
        this.overlayIndex = 0;
      }
      this.dispatchEvent(
        new CustomEvent('symmetries-updated', {detail: this.pausePatterns}),
      );
    }
  }

  /** How many pixels in the thick grid lines. */
  private blockBorderWidth = 0;
  /**
   * How many pixels are in one block, including one block border, two interior
   * borders, and three cells.
   */
  private blockSize = 0;
  /** How many pixels are in one side of the grid. */
  @state() sideSize = 0;
  /** How many pixels on each side of a cell. */
  private _cellSize = 0;

  get cellSize(): number {
    return this._cellSize;
  }

  /**
   * The device-pixel offsets of cells' centers.  There are 9 offsets: they are
   * indexed by either row or col.
   */
  private centers: number[] = [];

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
    const cellSize = (this._cellSize = Math.floor(
      (sideSize - 4 * blockBorderWidth - 6 * 1) / 9,
    ));
    const blockSize = (this.blockSize =
      3 * cellSize + 2 * 1 + 1 * blockBorderWidth);
    this.sideSize = blockBorderWidth + 3 * blockSize;

    const centers = [];
    const half = cellSize / 2;
    for (let i = 0; i < 3; ++i) {
      for (let j = 0; j < 3; ++j) {
        centers[i * 3 + j] =
          blockBorderWidth + blockSize * i + cellSize * j + j + half;
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
