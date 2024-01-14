import './events';
import './num-input';

import {css, html, LitElement, PropertyValues} from 'lit';
import {customElement, property, query, state} from 'lit/decorators.js';
import {ref} from 'lit/directives/ref.js';
import * as wasm from 'luke-doku-rust';
import {SymMatch, WasmSymMatch} from './sym-match';
import {GridCanvasContainer, Point, Theme} from './types';
import {NumInput} from './num-input';
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

/** The font for puzzles' clue numerals. */
const CLUE_FONT = 'Merriweather Sans';
/** The font weight for clues. */
const CLUE_FONT_WEIGHT = 700;
/** The font for puzzles' input numerals. */
const SOLUTION_FONT = 'Prompt';
/** The font weight for input numerals. */
const SOLUTION_FONT_WEIGHT = 400;

/**
 * Displays a Sudoku puzzle, or an overlay that obscures it and illustrates the
 * symmetry of its clues.
 */
@customElement('sudoku-view')
export class SudokuView extends LitElement implements GridCanvasContainer {
  static override styles = [
    css`
      :host {
        --angle: 0turn;
        --circle-center: 0px 0px;
        --gf: #fff;
        --gd: #ddd;
        --gc: #ccc;
        --ga: #aaa;
        --g9: #999;
        --g8: #888;

        display: flex;
        align-items: center;
        justify-content: center;
        background-color: var(--gf);
      }

      canvas {
        overflow: hidden;
        touch-action: none;
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
    const {sideSize} = this;
    const cssSize = sideSize / devicePixelRatio;
    return html`
      <canvas
        ${ref(this.canvasChanged)}
        width=${sideSize}
        height=${sideSize}
        style="width: ${cssSize}px; height: ${cssSize}px;"
        @pointerenter=${this.handlePointerHovering}
        @pointermove=${this.handlePointerHovering}
        @pointerleave=${this.handlePointerHovering}
        @pointercancel=${this.handlePointerCancel}
        @pointerdown=${this.handlePointerDown}
        @pointerup=${this.handlePointerUp}
      ></canvas>
      ${this.interactive
        ? html`<num-input .gridContainer=${this}></num-input>`
        : html``}
    `;
  }

  /** Light or dark mode. */
  @property({reflect: true}) theme: Theme = 'light';

  /** Minimum padding on all 4 sides of the component around the Sudoku grid. */
  @property({type: Number}) padding = 0;

  /** Whether to accept input to the puzzle. */
  @property({type: Boolean}) interactive = false;

  /** The puzzle we're displaying. Setting this will update `overlays`. */
  @property() puzzle: wasm.Grid | null = null;

  /** The symmetry overlays that go along with this puzzle. */
  private symMatches: SymMatch[] = [];

  /** The game state. */
  private game: Game | null = null;

  /** Which overlay to display, or null to display the puzzle. */
  @property({type: Number}) overlayIndex: number | null = null;

  /** The symmetry overlays that correspond to the current puzzle. */
  get overlays(): readonly SymMatch[] {
    return this.symMatches;
  }

  private readonly resizeObserver = new ResizeObserver(() => {
    if (!this.canvas) return;
    this.calcMetrics();
    this.draw();
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

  canvas!: HTMLCanvasElement;
  ctx!: CanvasRenderingContext2D;
  private canvasChanged(canvas?: Element) {
    if (canvas instanceof HTMLCanvasElement) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d')!;
      this.calcMetrics();
      this.draw();
    }
  }

  /** The possible input location the pointer last hovered over. */
  private hoverLoc?: Loc;

  /** The location the user is editing. */
  private inputLoc?: Loc;

  /** The numeral-input component. */
  @query('num-input', true) private numInput?: NumInput;

  /** The numeral we'll use as input for single taps. */
  private defaultNum = 1;

  private convertCoordinateToCellNumber(coord: number): number | undefined {
    const sideSize = this.sideSize / devicePixelRatio;
    if (coord < 0 || coord >= sideSize) return undefined;
    return Math.floor(coord / (sideSize / 9));
  }

  private convertPointToLoc(point: {x: number; y: number}): Loc | undefined {
    const rect = this.canvas.getBoundingClientRect();
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
    const {numInput, inputLoc} = this;
    if (numInput && inputLoc) {
      numInput.pointerMoved(event);
      return;
    }
    const loc = this.convertPointToLoc(event);
    if (loc && this.isPossibleInputLoc(loc)) {
      this.hoverLoc = loc;
    } else {
      this.hoverLoc = undefined;
    }
    this.draw();
  }

  private handlePointerCancel(event: PointerEvent) {
    const {numInput, inputLoc} = this;
    if (numInput && inputLoc) {
      this.canvas?.releasePointerCapture(event.pointerId);
      numInput.cancelInput();
      this.inputLoc = undefined;
      this.hoverLoc = inputLoc;
    }
  }

  private handlePointerDown(event: PointerEvent) {
    const loc = this.convertPointToLoc(event);
    const {numInput, inputLoc, defaultNum} = this;
    if (numInput && !inputLoc && loc && this.isPossibleInputLoc(loc)) {
      this.inputLoc = loc;
      this.hoverLoc = undefined;
      this.canvas.setPointerCapture(event.pointerId);
      numInput.startSingleInput(event, loc, defaultNum);
      this.draw();
    }
  }

  private handlePointerUp(event: PointerEvent) {
    this.canvas?.releasePointerCapture(event.pointerId);
    const {numInput, inputLoc, game} = this;
    if (numInput && inputLoc && game) {
      const result = numInput.completeInput();
      switch (result) {
        case 'cancel':
          break;
        case 'multiple':
          numInput.startMultipleInput(inputLoc, game.marks.getNums(inputLoc));
          break;
        case 'clear':
          game.marks.clearCell(inputLoc);
          break;
        default:
          game.marks.setNum(inputLoc, result);
          this.defaultNum = result;
          break;
      }
      if (result !== 'multiple') {
        this.inputLoc = undefined;
        this.hoverLoc = inputLoc;
        this.draw();
      }
    }
  }

  override updated(changedProperties: PropertyValues) {
    let redraw = false;
    if (changedProperties.has('puzzle')) {
      this.game = null;
      this.symMatches = [];
      this.updateGameAndSymmetries();
      this.defaultNum = 1;
      redraw = true;
    }
    if (
      changedProperties.has('overlayIndex') ||
      changedProperties.has('theme')
    ) {
      if (this.canvas) {
        this.updateBackground();
        redraw = true;
      }
    }
    if (redraw && this.ctx) {
      this.draw();
    }
  }

  private updateGameAndSymmetries() {
    const {puzzle, ctx} = this;
    if (puzzle && ctx && !this.symMatches.length) {
      this.game = new Game(puzzle);
      const matches: [wasm.Sym, WasmSymMatch][] = wasm.bestSymmetryMatches(
        puzzle,
        MAX_NONCONFORMING_LOCS
      );
      this.symMatches = matches.map(([sym, match]) => {
        const random = new wasm.JsRandom(puzzle.toFlatString());
        const symMatch = new SymMatch(sym, match, puzzle, this, random);
        random.free();
        return symMatch;
      });
      this.dispatchEvent(
        new CustomEvent('symmetries-updated', {detail: this.symMatches})
      );
      if (
        this.overlayIndex !== null &&
        this.overlayIndex >= this.symMatches.length
      ) {
        this.overlayIndex = 0;
      }
      this.updateBackground();
    }
  }

  private updateBackground() {
    const {canvas, overlayIndex} = this;
    const match = overlayIndex !== null ? this.symMatches[overlayIndex] : null;
    const cls = match === null ? `no-gradient` : BACKGROUNDS[match.sym];
    const {classList} = canvas;
    classList.forEach(c => {
      if (BACKGROUND_CLASSES.has(c)) {
        classList.remove(c);
      }
    });
    classList.add(cls);
    if (match) {
      this.style.setProperty('--angle', `${match.angle}deg`);
      this.style.setProperty('--circle-center', match.circleCenter);
    }
    const dark = this.theme === 'dark';
    for (const c of '89abcdf') {
      const t = dark ? (15 - parseInt(c, 16)).toString(16) : c;
      this.style.setProperty(`--g${c}`, `#${t}${t}${t}`);
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

  /** The CSS font string for clues. */
  private clueFont = CLUE_FONT;
  /** The CSS font string for solution numerals. */
  private solutionFont = SOLUTION_FONT;
  /** How far below the center we must position clues within a cell. */
  private clueTextOffset = 0;
  /**
   * How far below the center we must position solution numerals within a cell.
   */
  private solutionTextOffset = 0;

  private calcMetrics() {
    const rect = this.getBoundingClientRect();
    let size = Math.min(rect.width, rect.height);
    size -= 2 * this.padding;
    let sideSize = devicePixelRatio * size;
    const blockBorderWidth = (this.blockBorderWidth =
      sideSize < 150 ? 1 : sideSize < 200 ? 2 : 3);
    const cellSize = (this._cellSize = Math.floor(
      (sideSize - 4 * blockBorderWidth - 6 * 1) / 9
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

    if (this.ctx) {
      this.setUpFonts();
    }
  }

  private setUpFonts() {
    const factor = this.blockBorderWidth > 1 ? 0.75 : 0.85;
    const size = Math.round(this.cellSize * factor);
    this.clueFont = `${CLUE_FONT_WEIGHT} ${size}px ${CLUE_FONT}`;
    this.solutionFont = `${SOLUTION_FONT_WEIGHT} ${size}px ${SOLUTION_FONT}`;
    this.clueTextOffset = this.calcTextOffset(this.clueFont);
    this.solutionTextOffset = this.calcTextOffset(this.solutionFont);
  }

  private calcTextOffset(font: string): number {
    const {ctx} = this;
    ctx.font = font;
    ctx.textBaseline = 'middle';
    const metrics = ctx.measureText('123456789');
    // Distance from baseline to center of numerals.
    return Math.round(
      (metrics.actualBoundingBoxAscent - metrics.actualBoundingBoxDescent) / 2
    );
  }

  private draw() {
    const {ctx, theme} = this;
    ctx.setTransform({});
    const {width, height} = ctx.canvas;
    ctx.clearRect(0, 0, width, height);

    this.drawGrid();
    const {game, cellCenter} = this;
    if (!game) return;
    if (this.isPaused) {
      this.drawSymOverlay();
    } else {
      if (this.hoverLoc) {
        const [x, y] = cellCenter(this.hoverLoc);
        const {cellSize} = this;
        ctx.fillStyle = theme === 'light' ? '#aecbfa' : '#337';
        ctx.fillRect(x - cellSize / 2, y - cellSize / 2, cellSize, cellSize);
      }
      ctx.fillStyle = theme === 'light' ? '#222' : '#ccc';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const {clueTextOffset, solutionTextOffset} = this;
      ctx.font = this.clueFont;
      for (const loc of Loc.ALL) {
        const clue = game.marks.getClue(loc);
        if (clue) {
          const [x, y] = cellCenter(loc);
          ctx.fillText(String(clue), x, y + clueTextOffset);
        }
      }
      ctx.font = this.solutionFont;
      for (const loc of Loc.ALL) {
        const num = game.marks.getNum(loc);
        if (num) {
          const [x, y] = cellCenter(loc);
          ctx.fillText(String(num), x, y + solutionTextOffset);
        }
      }
    }
  }

  private drawSymOverlay() {
    this.symMatches[this.overlayIndex!].draw();
  }

  private drawGrid() {
    const {ctx, theme, blockBorderWidth, blockSize, _cellSize: cellSize} = this;
    const size = 3 * blockSize + blockBorderWidth;
    ctx.strokeStyle = '#808080';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i < 3; ++i) {
      for (let j = 1; j < 3; ++j) {
        const cellEdge =
          blockBorderWidth + blockSize * i + cellSize * j + j + 0.5;
        ctx.moveTo(0, cellEdge);
        ctx.lineTo(size, cellEdge);
        ctx.moveTo(cellEdge, 0);
        ctx.lineTo(cellEdge, size);
      }
    }
    ctx.stroke();
    ctx.strokeStyle = theme === 'light' ? '#111' : '#eee';
    ctx.lineWidth = blockBorderWidth;
    ctx.beginPath();
    for (let i = 0; i <= 3; ++i) {
      const blkEdge = blockSize * i + blockBorderWidth / 2;
      ctx.moveTo(0, blkEdge);
      ctx.lineTo(size, blkEdge);
      ctx.moveTo(blkEdge, 0);
      ctx.lineTo(blkEdge, size);
    }
    ctx.stroke();
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'sudoku-view': SudokuView;
  }
}
