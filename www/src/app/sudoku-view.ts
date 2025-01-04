import './events';
import './sudoku-input';

import {css, html, LitElement, PropertyValues, svg, TemplateResult} from 'lit';
import {customElement, property, query, state} from 'lit/decorators.js';
import {classMap} from 'lit/directives/class-map.js';
import {ref} from 'lit/directives/ref.js';
import {Game, type GameWrapper, PlayState} from '../game/game';
import {Loc} from '../game/loc';
import {ReadonlyMarks} from '../game/marks';
import {Sudoku} from '../game/sudoku';
import {ReadonlyTrails} from '../game/trails';
import {PausePattern} from './pause-pattern';
import {
  CLUES_FONT,
  HIGHLIGHT_COLOR,
  SOLUTION_FONT_FAMILY,
  SOLUTION_FONT_WEIGHT,
  TRAILHEAD_FONT_STYLE,
  TRAILHEAD_FONT_WEIGHT,
} from './styles';
import {SudokuInput} from './sudoku-input';
import {TrailColors} from './trail-colors';
import {
  cssPixels,
  DevicePixels,
  devicePixels,
  GridContainer,
  Point,
} from './types';

const COMPLETED_HALF_CYCLE_SEC = 10;
const COMPLETED_CYCLE_SEC = 2 * COMPLETED_HALF_CYCLE_SEC;

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

        --block-border: light-dark(#111, #eee);
        --hover-loc: light-dark(#bdd4f9, #339);
        --hover-loc-text: light-dark(#2222, #aaac);
        --clue-fill: light-dark(#222, #eee);
        --solution-fill: light-dark(#222, #ccc);
        --clock-fill: light-dark(#f0f0f0e0, #202020e0);
        --target-fill: light-dark(#e0e0e040, #30303040);
        --selection-fill: ${HIGHLIGHT_COLOR};
        --broken-fill: #f00;

        --gf: light-dark(#fff, #000);
        --gd: light-dark(#ddd, #222);
        --gc: light-dark(#ccc, #333);
        --ga: light-dark(#aaa, #555);
        --g9: light-dark(#999, #666);
        --g8: light-dark(#888, #777);
      }

      #multi-input-popup {
        display: none;
      }

      :host([playstate='running']) #multi-input-popup {
        display: block;
        z-index: 100;
      }
      :host([playstate='running']) #pause {
        opacity: 0;
        transition: opacity, 200ms;
      }
      :host([playstate='running']) #pause-background {
        opacity: 0;
        transition: opacity, 500ms;
      }
      :host([playstate='running']) #clues {
        opacity: 1;
        transition: opacity, 100ms;
      }
      :host([playstate='running']) #solution,
      :host([playstate='running']) #input {
        opacity: 1;
        transition: opacity, 300ms;
      }

      :host([playstate='unstarted']) #pause,
      :host([playstate='paused']) #pause {
        opacity: 1;
        transition: opacity, 200ms;
      }
      :host([playstate='unstarted']) #pause-background,
      :host([playstate='paused']) #pause-background {
        opacity: 1;
        transition: opacity, 500ms;
      }
      :host([playstate='unstarted']) #clues,
      :host([playstate='paused']) #clues {
        opacity: 0;
        transition: opacity, 100ms;
      }
      :host([playstate='unstarted']) #solution,
      :host([playstate='paused']) #solution,
      :host([playstate='unstarted']) #input,
      :host([playstate='paused']) #input {
        opacity: 0;
        transition: opacity, 300ms;
      }

      #next-pause-background,
      #next-pause {
        transform: translateX(-100%);
      }

      :host([playstate='completed']) #clues {
        animation: ${COMPLETED_HALF_CYCLE_SEC}s infinite alternate
          completed-clues;
      }
      :host([playstate='completed']) #solution {
        animation: ${COMPLETED_HALF_CYCLE_SEC}s infinite alternate
          completed-solution;
      }
      :host([playstate='completed']) #pause-background {
        animation: ${COMPLETED_HALF_CYCLE_SEC}s infinite alternate
          completed-pause-background;
      }
      :host([playstate='completed']) #pause {
        animation: ${COMPLETED_HALF_CYCLE_SEC}s infinite alternate
          completed-pause;
      }
      :host([playstate='completed']) #pause-background.next {
        animation:
          ${COMPLETED_CYCLE_SEC}s infinite pause-next,
          ${COMPLETED_HALF_CYCLE_SEC}s infinite alternate
            completed-pause-background;
      }
      :host([playstate='completed']) #pause.next {
        animation:
          ${COMPLETED_CYCLE_SEC}s infinite pause-next,
          ${COMPLETED_HALF_CYCLE_SEC}s infinite alternate completed-pause;
      }
      :host([playstate='completed']) #next-pause-background {
        animation: ${COMPLETED_HALF_CYCLE_SEC}s infinite alternate
          completed-pause-background;
      }
      :host([playstate='completed']) #next-pause {
        animation: ${COMPLETED_HALF_CYCLE_SEC}s infinite alternate
          completed-pause;
      }
      :host([playstate='completed']) #next-pause-background.next {
        animation:
          ${COMPLETED_CYCLE_SEC}s infinite next-pause,
          ${COMPLETED_HALF_CYCLE_SEC}s infinite alternate
            completed-pause-background;
      }
      :host([playstate='completed']) #next-pause.next {
        animation:
          ${COMPLETED_CYCLE_SEC}s infinite next-pause,
          ${COMPLETED_HALF_CYCLE_SEC}s infinite alternate completed-pause;
      }

      @keyframes completed-clues {
        0% {
          opacity: 1;
        }
        50% {
          opacity: 1;
        }
        80% {
          opacity: 0;
        }
        100% {
          opacity: 0;
        }
      }

      @keyframes completed-solution {
        0% {
          opacity: 1;
        }
        15% {
          opacity: 1;
        }
        45% {
          opacity: 0;
        }
        100% {
          opacity: 0;
        }
      }

      @keyframes completed-pause {
        0% {
          opacity: 0;
        }
        50% {
          opacity: 0;
        }
        75% {
          opacity: 1;
        }
        100% {
          opacity: 1;
        }
      }

      @keyframes completed-pause-background {
        0% {
          opacity: 0;
        }
        10% {
          opacity: 0;
        }
        60% {
          opacity: 1;
        }
        100% {
          opacity: 1;
        }
      }

      @keyframes pause-next {
        0% {
          transform: translateX(0%);
        }
        48% {
          transform: translateX(0%);
        }
        52% {
          transform: translateX(100%);
        }
        100% {
          transform: translateX(100%);
        }
      }

      @keyframes next-pause {
        0% {
          transform: translateX(-100%);
        }
        48% {
          transform: translateX(-100%);
        }
        52% {
          transform: translateX(0%);
        }
        100% {
          transform: translateX(0%);
        }
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
        font-family: ${SOLUTION_FONT_FAMILY};
        font-weight: ${SOLUTION_FONT_WEIGHT};
        fill: var(--hover-loc-text);
      }
      text.clue {
        font: ${CLUES_FONT};
        fill: var(--clue-fill);
      }
      .solution,
      text.clock-text {
        font-family: ${SOLUTION_FONT_FAMILY};
        font-weight: ${SOLUTION_FONT_WEIGHT};
        fill: var(--solution-fill);
        color: var(--solution-fill);
      }
      text.trail {
        font-family: ${SOLUTION_FONT_FAMILY};
        font-weight: ${SOLUTION_FONT_WEIGHT};
      }
      text.trail.hover-loc {
        opacity: 50% !important;
      }
      text.trail.trailhead {
        font-weight: ${TRAILHEAD_FONT_WEIGHT};
        font-style: ${TRAILHEAD_FONT_STYLE};
      }
      text.solution,
      text.trail {
        opacity: 70%;
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
      .multi .solution {
        opacity: 40%;
      }
      svg:not(.trail-active) .multi .solution {
        opacity: 90%;
      }
      .solution.large {
        font-size: 0.8em;
      }
      .solution.medium {
        font-size: 0.7em;
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
    const {
      sideSize,
      cellSize,
      padding,
      gameWrapper,
      pausePatterns,
      overlayIndex,
    } = this;
    const game = gameWrapper?.game;
    const cssSize = sideSize / devicePixelRatio + 2 * padding;
    const svgPadding = padding * devicePixelRatio;
    const compSize = sideSize + 2 * svgPadding;
    const pausePattern = pausePatterns[overlayIndex];
    const nextPattern =
      pausePatterns.length > 1 ?
        pausePatterns[(overlayIndex + 1) % pausePatterns.length]
      : null;
    const nextPauseClass = {next: !!nextPattern && this.showNextOverlay};

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
            font-size: ${cellSize * 0.35}px;
          }
          text.trail.trail-index-0 {
            font-size: ${cellSize * 0.4}px;
            transform: translate(-${cellSize * 0.3}px, -${cellSize * 0.25}px);
          }
          text.trail-index-1 {
            transform: translate(${cellSize * 0.3}px, -${cellSize * 0.25}px);
          }
          text.trail-index-2 {
            transform: translate(-${cellSize * 0.3}px, ${cellSize * 0.3}px);
          }
          text.trail-index-3 {
            transform: translate(${cellSize * 0.3}px, ${cellSize * 0.3}px);
          }
          ${this.renderTrailColors()}
        </style>
        <g id="pause-background" class=${classMap(nextPauseClass)}>
          ${pausePattern?.renderBackground()}
        </g>
        ${nextPattern ?
          svg`<g id="next-pause-background" class=${classMap(nextPauseClass)}
            >${nextPattern.renderBackground()}</g
          >`
        : ''}
        <g id="grid">${this.renderGrid()}</g>
        <g
          id="pause"
          class=${classMap(nextPauseClass)}
          @animationiteration=${this.optionallyShowNextOverlay}
        >
          ${pausePattern?.renderPattern()}
        </g>
        ${nextPattern ?
          svg`<g
            id="next-pause"
            class=${classMap(nextPauseClass)}
            @animationiteration=${this.bumpOverlayIndex}
          >
            ${nextPattern.renderPattern()}
          </g>`
        : ''}
        <g id="clues">${game && this.renderClues(game)}</g>
        <g id="solution">${game && this.renderGameState(game)}</g>
        <g id="input">${this.input?.renderInGrid()}</g>
      </svg>
      ${this.input?.renderMultiInputPopup()}
    `;
  }

  private renderTrailColors() {
    const {gameWrapper, trailColors} = this;
    if (!gameWrapper || !trailColors) return;
    const numColors = gameWrapper.game.trails.order.length;
    const colors = trailColors.getColors(numColors);
    return colors.map(
      (c, i) => svg`
        ${`text.trail.trail-${i}`} {
          fill: ${c};
        }
      `,
    );
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

  private renderClues(game: Game) {
    const brokenLocs = game.marks.asGrid().brokenLocs();
    const answer: TemplateResult[] = [];
    const {marks} = game;
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
    return answer;
  }

  private renderGameState(game: Game) {
    const brokenLocs = game.marks.asGrid().brokenLocs();
    const answer = this.input?.renderHoverLoc() ?? [];
    this.pushSolutionCells(game.marks, brokenLocs, answer);
    this.pushTrails(game.trails, answer);
    return answer;
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
          size > 5 ? 'xsmall'
          : size > 3 ? 'small'
          : size > 2 ? 'medium'
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

  /** Padding on all 4 sides of the Sudoku grid. */
  @property({converter: Number}) padding = cssPixels(0);

  /** Whether to accept input to the puzzle. */
  @property({type: Boolean}) interactive = false;

  /** The game's play state.  Reflects `game.playState`. */
  @property({reflect: true}) playState: PlayState = PlayState.UNSTARTED;

  /**
   * The game, wrapped in an object that's recreated on every command so we'll
   * be automatically updated.
   */
  @property({attribute: false}) gameWrapper: GameWrapper | null = null;
  private sudoku: Sudoku | null = null;
  private trailColors: TrailColors | null = null;

  /** The symmetry overlays that go along with this puzzle. */
  @state() private pausePatterns: PausePattern[] = [];

  /** Which overlay to display when the game is paused. */
  @state() private overlayIndex = 0;

  /** Whether to show and animate the next pause overlay. */
  @state() private showNextOverlay = false;

  /**
   * The element that lets you assign more than one possible numeral to a
   * location.
   */
  @query('#multi-input-popup') multiInputPopup?: SVGElement;

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
    if (changedProperties.has('gameWrapper')) {
      const game = this.gameWrapper?.game;
      this.playState = game?.playState ?? PlayState.UNSTARTED;
      if (
        game?.sudoku != this.sudoku // single = on purpose
      ) {
        this.sudoku = game ? game.sudoku : null;
        this.pausePatterns = [];
        this.updateSymmetries();
        this.trailColors =
          game ? new TrailColors(game.sudoku.cluesString()) : null;
      }
    }
  }

  private updateSymmetries() {
    const {gameWrapper, interactive} = this;
    if (gameWrapper && !this.pausePatterns.length) {
      this.input =
        interactive ? new SudokuInput(this, gameWrapper.game) : undefined;
      this.pausePatterns = gameWrapper.game.sudoku.symmetryMatches.map(
        (symMatch, index) =>
          new PausePattern(
            symMatch,
            index,
            gameWrapper.game.sudoku.clues,
            this,
          ),
      );
      this.overlayIndex = 0;
    }
  }

  private bumpOverlayIndex(event: AnimationEvent) {
    if (event.animationName === 'next-pause') {
      this.overlayIndex = (this.overlayIndex + 1) % this.pausePatterns.length;
    }
  }

  private optionallyShowNextOverlay(event: AnimationEvent) {
    if (event.animationName === 'completed-pause') {
      const halfCycleCount = Math.round(
        event.elapsedTime / COMPLETED_HALF_CYCLE_SEC,
      );
      const fullCycleComplete = halfCycleCount % 2 === 0;
      if (fullCycleComplete) {
        this.showNextOverlay = Math.random() < 0.083; // 1 in 12
      }
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
      sideSize < 150 ? 1
      : sideSize < 200 ? 2
      : 3);
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
