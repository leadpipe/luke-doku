import './events';
import './clock-input';

import {css, html, LitElement, PropertyValues, svg} from 'lit';
import {customElement, property, state} from 'lit/decorators.js';
import {ref} from 'lit/directives/ref.js';
import * as wasm from 'luke-doku-rust';
import {PausePattern, WasmSymMatch} from './pause-pattern';
import {GridContainer, Point, Theme} from './types';
import {ClockInput} from './clock-input';
import {Loc} from '../game/loc';
import {Game} from '../game/game';

/**
 * Maps from symmetry to CSS class name for the background to show with that
 * symmetry.
 */
const BACKGROUNDS: {[key in wasm.Sym]: string} = {
  [wasm.Sym.Rotation180]: 'gradient-180',
  [wasm.Sym.Rotation90]: 'gradient-90',
  [wasm.Sym.Mirror_X]: 'gradient-x',
  [wasm.Sym.Mirror_Y]: 'gradient-y',
  [wasm.Sym.Diagonal_Main]: 'gradient-main',
  [wasm.Sym.Diagonal_Anti]: 'gradient-anti',
  [wasm.Sym.Blockwise_Main]: 'gradient-blockwise-main',
  [wasm.Sym.Blockwise_Anti]: 'gradient-blockwise-anti',
  [wasm.Sym.DoubleMirror]: 'gradient-double-mirror',
  [wasm.Sym.DoubleDiagonal]: 'gradient-double-diagonal',
  [wasm.Sym.FullyReflective]: 'gradient-fully-reflective',
  [wasm.Sym.None]: 'gradient-circle',
};

/** Gathers the CSS class names we use as backgrounds. */
const BACKGROUND_CLASSES = new Set([
  'no-gradient',
  ...Object.values(BACKGROUNDS),
]);

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

        --angle: 0turn;
        --circle-center: 0px 0px;

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

      .gradient-180 {
        background: conic-gradient(
          from var(--angle) at 50%,
          var(--gc),
          var(--gf) 50%,
          var(--gc) 50%,
          var(--gf)
        );
      }

      .gradient-90 {
        background: conic-gradient(
          from var(--angle) at 50%,
          var(--gc),
          var(--gf) 25%,
          var(--gc) 25%,
          var(--gf) 50%,
          var(--gc) 50%,
          var(--gf) 75%,
          var(--gc) 75%,
          var(--gf)
        );
      }

      .gradient-x {
        background: linear-gradient(
          0deg,
          var(--gf),
          var(--gd) 35%,
          var(--ga) 45%,
          var(--g9) 50%,
          var(--ga) 55%,
          var(--gd) 65%,
          var(--gf)
        );
      }

      .gradient-y {
        background: linear-gradient(
          90deg,
          var(--gf),
          var(--gd) 35%,
          var(--ga) 45%,
          var(--g9) 50%,
          var(--ga) 55%,
          var(--gd) 65%,
          var(--gf)
        );
      }

      .gradient-main {
        background: linear-gradient(
          45deg,
          var(--gf),
          var(--gd) 35%,
          var(--ga) 45%,
          var(--g9) 50%,
          var(--ga) 55%,
          var(--gd) 65%,
          var(--gf)
        );
      }

      .gradient-anti {
        background: linear-gradient(
          -45deg,
          var(--gf),
          var(--gd) 35%,
          var(--ga) 45%,
          var(--g9) 50%,
          var(--ga) 55%,
          var(--gd) 65%,
          var(--gf)
        );
      }

      .gradient-blockwise-main {
        background: linear-gradient(
          45deg,
          var(--gc) 0,
          var(--gf) 16.67%,
          var(--gc) 16.67%,
          var(--gf) 33.33%,
          var(--gc) 33.33%,
          var(--gf) 50%,
          var(--gc) 50%,
          var(--gf) 66.67%,
          var(--gc) 66.67%,
          var(--gf) 83.33%,
          var(--gc) 83.33%,
          var(--gf) 100%
        );
      }

      .gradient-blockwise-anti {
        background: linear-gradient(
          135deg,
          var(--gc) 0,
          var(--gf) 16.67%,
          var(--gc) 16.67%,
          var(--gf) 33.33%,
          var(--gc) 33.33%,
          var(--gf) 50%,
          var(--gc) 50%,
          var(--gf) 66.67%,
          var(--gc) 66.67%,
          var(--gf) 83.33%,
          var(--gc) 83.33%,
          var(--gf) 100%
        );
      }

      .gradient-double-mirror {
        background: conic-gradient(
          from 0deg at 50%,
          var(--gf),
          var(--gd) 15%,
          var(--ga) 25%,
          var(--gd) 35%,
          var(--gf) 50%,
          var(--gd) 65%,
          var(--ga) 75%,
          var(--gd) 85%,
          var(--gf)
        );
      }

      .gradient-double-diagonal {
        background: conic-gradient(
          from 45deg at 50%,
          var(--gf),
          var(--gd) 15%,
          var(--ga) 25%,
          var(--gd) 35%,
          var(--gf) 50%,
          var(--gd) 65%,
          var(--ga) 75%,
          var(--gd) 85%,
          var(--gf)
        );
      }

      .gradient-fully-reflective {
        background: conic-gradient(
          from 45deg at 50%,
          var(--gf),
          var(--gd) 7.5%,
          var(--ga) 12.5%,
          var(--gd) 17.5%,
          var(--gf) 25%,
          var(--gd) 32.5%,
          var(--ga) 37.5%,
          var(--gd) 42.5%,
          var(--gf) 50%,
          var(--gd) 57.5%,
          var(--ga) 62.5%,
          var(--gd) 67.5%,
          var(--gf) 75%,
          var(--gd) 82.5%,
          var(--ga) 87.5%,
          var(--gd) 92.5%,
          var(--gf)
        );
      }

      .gradient-circle {
        background: radial-gradient(
          circle at var(--circle-center),
          var(--g8),
          var(--ga) 15%,
          var(--gd) 40%,
          var(--gf) 90%
        );
      }

      .no-gradient {
        /* An actual lack of gradient makes Chrome mess up when switching back to a gradient. */
        background: linear-gradient(0deg, var(--gf), var(--gf));
      }
    `,
  ];

  override render() {
    const {sideSize, cellSize} = this;
    const cssSize = sideSize / devicePixelRatio;
    return html`
      <svg
        ${ref(this.svgChanged)}
        viewBox="0 0 ${sideSize} ${sideSize}"
        width=${sideSize}
        height=${sideSize}
        style="width: ${cssSize}px; height: ${cssSize}px;"
        @pointerenter=${this.handlePointerHovering}
        @pointermove=${this.handlePointerHovering}
        @pointerleave=${this.handlePointerHovering}
        @pointercancel=${this.handlePointerCancel}
        @pointerdown=${this.handlePointerDown}
        @pointerup=${this.handlePointerUp}
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
        ${this.renderGrid()} ${this.renderGameState()}
        ${this.clockInput?.render()}
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

  private renderGameState() {
    const {game} = this;
    if (!game) return;
    if (this.isPaused) {
      return this.renderPausePattern();
    }
    const {hoverLoc, cellCenter, cellSize} = this;
    const halfCell = cellSize / 2;
    const answer = [];
    if (hoverLoc) {
      const [x, y] = cellCenter(hoverLoc);
      answer.push(svg`
        <rect class="hover-loc"
              x=${x - halfCell}
              y=${y - halfCell}
              width=${cellSize}
              height=${cellSize}
              />`);
      if (!game.marks.getNum(hoverLoc) && !this.inputLoc) {
        answer.push(svg`
          <text x=${x} y=${y} class="hover-loc">${this.defaultNum}</text>`);
      }
    }
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

  private renderPausePattern() {
    return this.pausePatterns[this.overlayIndex!].render();
  }

  /** Light or dark mode. */
  @property({reflect: true}) theme: Theme = 'light';

  /** Minimum padding on all 4 sides of the component around the Sudoku grid. */
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

  private readonly keyHandler = (event: KeyboardEvent) =>
    this.handleKeyDown(event);

  private readonly resizeObserver = new ResizeObserver(() => {
    if (!this.svg) return;
    this.calcMetrics();
  });

  override connectedCallback(): void {
    super.connectedCallback();
    this.resizeObserver.observe(this);
    window.addEventListener('keydown', this.keyHandler);
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.resizeObserver.unobserve(this);
    window.removeEventListener('keydown', this.keyHandler);
  }

  get isPaused(): boolean {
    return this.overlayIndex !== null;
  }

  private svg!: SVGElement;
  private svgChanged(svg?: Element) {
    if (svg instanceof SVGElement) {
      this.svg = svg;
      this.calcMetrics();
    }
  }

  get element() {
    return this.svg;
  }

  /** The possible input location the pointer last hovered over. */
  @state() private hoverLoc?: Loc;

  /** The location the user is editing. */
  private inputLoc?: Loc;

  /** The clock-input tracker. */
  private clockInput?: ClockInput;

  /** The numeral we'll use as input for single taps. */
  private defaultNum = 1;

  private convertCoordinateToCellNumber(coord: number): number | undefined {
    const sideSize = this.sideSize / devicePixelRatio;
    if (coord < 0 || coord >= sideSize) return undefined;
    return Math.floor(coord / (sideSize / 9));
  }

  private convertPointToLoc(point: {x: number; y: number}): Loc | undefined {
    const rect = this.svg.getBoundingClientRect();
    const col = this.convertCoordinateToCellNumber(point.x - rect.x);
    const row = this.convertCoordinateToCellNumber(point.y - rect.y);
    if (col === undefined || row === undefined) return undefined;
    return new Loc(row, col);
  }

  private isPossibleInputLoc(loc: Loc): boolean {
    if (this.isPaused || !this.game) return false;
    return this.game.marks.getClue(loc) === null;
  }

  private handlePointerHovering(event: PointerEvent) {
    const {clockInput, inputLoc} = this;
    if (clockInput && inputLoc) {
      clockInput.pointerMoved(event);
      return;
    }
    const loc = this.convertPointToLoc(event);
    if (loc && this.isPossibleInputLoc(loc)) {
      this.hoverLoc = loc;
    } else {
      this.hoverLoc = undefined;
    }
  }

  private handlePointerCancel(event: PointerEvent) {
    const {clockInput, inputLoc} = this;
    if (clockInput && inputLoc) {
      this.svg?.releasePointerCapture(event.pointerId);
      clockInput.cancelInput();
      this.inputLoc = undefined;
      this.hoverLoc = inputLoc;
    }
  }

  private handlePointerDown(event: PointerEvent) {
    if (!this.interactive) return;
    if (!this.clockInput) this.clockInput = new ClockInput(this);
    const loc = this.convertPointToLoc(event);
    const {clockInput, inputLoc, defaultNum} = this;
    if (clockInput && !inputLoc && loc && this.isPossibleInputLoc(loc)) {
      this.inputLoc = loc;
      this.hoverLoc = undefined;
      this.svg.setPointerCapture(event.pointerId);
      const num = this.game?.marks.getNum(loc);
      clockInput.startInput(event, loc, num, defaultNum);
    }
  }

  private handlePointerUp(event: PointerEvent) {
    this.svg?.releasePointerCapture(event.pointerId);
    const {clockInput, inputLoc, game} = this;
    if (clockInput && inputLoc && game) {
      const result = clockInput.completeInput();
      switch (result) {
        case 'cancel':
          break;
        case 'multiple':
          // clockInput.startMultipleInput(inputLoc, game.marks.getNums(inputLoc));
          break;
        case 'clear':
          game.marks.clearCell(inputLoc);
          break;
        default:
          if (game.marks.getNum(inputLoc) !== result) {
            game.marks.setNum(inputLoc, result);
            this.defaultNum = result;
          }
          break;
      }
      this.inputLoc = undefined;
      this.hoverLoc = inputLoc;
    }
  }

  private resetPointerInput() {
    this.hoverLoc = undefined;
  }

  private handleKeyDown(event: KeyboardEvent) {
    const {hoverLoc, game} = this;
    if (!game) return;
    let update = false;
    switch (event.key) {
      case 'Backspace':
      case 'Delete':
        // If we're hovering over a set cell, clear it.
        if (hoverLoc && game.marks.getNum(hoverLoc)) {
          game.marks.clearCell(hoverLoc);
          update = true;
        }
        break;

      default:
        // If it's a numeral, change the default input to it, and if we're
        // hovering over a cell also set the cell to it.
        if (event.key.length === 1 && event.key >= '1' && event.key <= '9') {
          const num = Number(event.key);
          this.defaultNum = num;
          if (hoverLoc && !game.marks.getClue(hoverLoc)) {
            game.marks.setNum(hoverLoc, num);
          }
          update = true;
        }
        break;
    }
    if (update) {
      this.requestUpdate();
    }
  }

  override updated(changedProperties: PropertyValues<this>) {
    let reset = false;
    if (changedProperties.has('puzzle')) {
      this.game = null;
      this.pausePatterns = [];
      this.updateGameAndSymmetries();
      this.defaultNum = 1;
      reset = true;
    }
    if (
      (changedProperties.has('overlayIndex') ||
        changedProperties.has('theme')) &&
      this.svg
    ) {
      this.updateBackground();
    }
    if (reset) {
      this.resetPointerInput();
    }
  }

  private updateGameAndSymmetries() {
    const {puzzle} = this;
    if (puzzle && !this.pausePatterns.length) {
      this.game = new Game(puzzle);
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
      this.updateBackground();
    }
  }

  private updateBackground() {
    const {svg, overlayIndex} = this;
    const pattern =
      overlayIndex !== null ? this.pausePatterns[overlayIndex] : null;
    const cls = pattern === null ? `no-gradient` : BACKGROUNDS[pattern.sym];
    const {classList} = svg;
    classList.forEach(c => {
      if (BACKGROUND_CLASSES.has(c)) {
        classList.remove(c);
      }
    });
    classList.add(cls);
    if (pattern) {
      this.style.setProperty('--angle', `${pattern.angle}deg`);
      this.style.setProperty('--circle-center', pattern.circleCenter);
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
  @state() private sideSize = 0;
  /** How many pixels on each side of a cell. */
  private _cellSize = 0;

  get cellSize(): number {
    return this._cellSize;
  }

  /**
   * The pixel offsets of cells' centers.  There are 9 offsets: they
   * are indexed by either row or col.
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
