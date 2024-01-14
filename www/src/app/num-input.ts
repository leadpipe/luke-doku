import {css, html, LitElement, PropertyValues} from 'lit';
import {customElement, property, state} from 'lit/decorators.js';
import {ref} from 'lit/directives/ref.js';
import {Loc} from '../game/loc';
import {GridCanvasContainer, Point} from './types';

/** The possible results of a single-numeral input interaction. */
export type SingleInputResult = number | 'clear' | 'multiple' | 'cancel';

/** How much of a grid cell the clock-face radius is. */
const RADIUS_RATIO = 0.85;
/** How many pixels of border we add to the clock faces. */
const BORDER_WIDTH = 2;
/** Converts from clock section to corresponding result. */
const SECTION_RESULT: readonly SingleInputResult[] = [
  'clear',
  1,
  2,
  3,
  4,
  5,
  6,
  7,
  8,
  9,
  'multiple',
  'cancel',
];

/**
 * Displays the clock-face Sudoku input mechanism for either single numerals or
 * sets of numerals.
 */
@customElement('num-input')
export class NumInput extends LitElement {
  @property() gridContainer: GridCanvasContainer | null = null;

  static override styles = [
    css`
      :host {
        position: fixed;
        top: 0;
        right: 0;
        bottom: 0;
        left: 0;
        pointer-events: none;
      }

      canvas {
        position: absolute;
      }

      canvas.multi-input {
        pointer-events: auto;
      }
    `,
  ];

  protected override render(): unknown {
    const dpr = window.devicePixelRatio;
    const {width, height} = this;

    return html`
      <canvas
        ${ref(this.canvasChanged)}
        width=${width}
        height=${height}
        style="width: ${width / dpr}px; height: ${height / dpr}px;"
        class=${this.multipleResult ? 'multi-input' : ''}
      ></canvas>
    `;
  }

  private inputCenter?: Point;
  private inputLoc?: Loc;
  private defaultSingleResult: SingleInputResult = 'cancel';
  private singleResult: SingleInputResult = 'cancel';
  private clockSection = -1;
  private multipleResult?: Set<number>;

  /**
   * Starts showing the single-input clock-face.
   * @param event The pointer event (click or touch) that started the interaction.
   * @param inputLoc The Sudoku grid location that's being input into.
   * @param defaultResult The result to return if the input is completed near the starting point.
   * @returns
   */
  startSingleInput(
    event: PointerEvent,
    inputLoc: Loc,
    defaultResult: SingleInputResult
  ) {
    const {gridContainer, canvas} = this;
    if (!gridContainer) return;
    this.inputCenter = [event.x, event.y];
    this.inputLoc = inputLoc;
    this.defaultSingleResult = defaultResult;
    this.singleResult = defaultResult;
    this.clockSection = -1;
    this.multipleResult = undefined;

    // We position the canvas so its center lines up with the center of the input cell.
    const [cellX, cellY] = gridContainer.cellCenter(inputLoc);
    const x = this.width / 2;
    const y = this.height / 2;
    const rect = gridContainer.canvas.getBoundingClientRect();
    canvas.style.left = `${rect.x + (cellX - x) / devicePixelRatio}px`;
    canvas.style.top = `${rect.y + (cellY - y) / devicePixelRatio}px`;
    this.draw();
  }

  /**
   * Starts showing the multiple-input clock-face.
   * @param inputLoc The Sudoku grid location that's being input into.
   * @param defaultSet The set to start with.
   * @returns
   */
  startMultipleInput(inputLoc: Loc, defaultSet: ReadonlySet<number> | null) {
    const {gridContainer, canvas} = this;
    if (!gridContainer) return;
    this.inputLoc = inputLoc;
    this.multipleResult = new Set(defaultSet ?? []);

    // We position the canvas so it lines up with the grid.
    const rect = gridContainer.canvas.getBoundingClientRect();
    canvas.style.left = `${rect.x}px`;
    canvas.style.top = `${rect.y}px`;
    this.draw();
    this.requestUpdate();
  }

  cancelInput() {
    this.inputCenter = undefined;
    this.inputLoc = undefined;
    this.draw();
  }

  completeInput(): SingleInputResult {
    this.cancelInput();
    return this.singleResult;
  }

  pointerMoved(event: PointerEvent) {
    const {x, y} = event;
    const {inputCenter, gridContainer} = this;
    if (!inputCenter || !gridContainer) return;
    const [centerX, centerY] = inputCenter;
    const distance = Math.hypot(x - centerX, y - centerY);
    if (distance > gridContainer.cellSize / devicePixelRatio / 2) {
      // Figure out which clock section to light up.
      const radians =
        x >= centerX
          ? Math.acos((centerY - y) / distance)
          : Math.PI + Math.acos((y - centerY) / distance);
      this.clockSection = Math.round((6 * radians) / Math.PI) % 12;
      this.singleResult = SECTION_RESULT[this.clockSection];
    } else {
      // Use the default result, and no clock section (light up the center
      // instead).
      this.singleResult = this.defaultSingleResult;
      this.clockSection = -1;
    }
    console.log(`result: ${this.singleResult}`);
    this.draw();
  }

  private readonly resizeObserver = new ResizeObserver(() => {
    this.calcSize();
  });

  override connectedCallback(): void {
    super.connectedCallback();
    this.resizeObserver.observe(this);
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.resizeObserver.unobserve(this);
  }

  override updated(changedProperties: PropertyValues) {
    if (changedProperties.has('gridContainer')) {
      this.calcSize();
    }
  }

  canvas!: HTMLCanvasElement;
  ctx!: CanvasRenderingContext2D;
  private canvasChanged(canvas?: Element) {
    if (canvas instanceof HTMLCanvasElement) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d')!;
      this.draw();
    }
  }

  @state() private width = 0;
  @state() private height = 0;
  private calcSize() {
    const {gridContainer} = this;
    if (!gridContainer) return;

    let {width, height} = gridContainer.canvas;
    // The width always matches the grid's width.
    // The height adds room for the NumSet input clock-face below the grid.
    height += RADIUS_RATIO * gridContainer.cellSize * 2 + BORDER_WIDTH;

    this.width = width;
    this.height = height;
  }

  draw() {
    const {gridContainer, inputLoc, ctx, width, height, multipleResult} = this;
    if (!gridContainer) return;
    ctx.clearRect(0, 0, width, height);
    if (!inputLoc) return;
    const radius = gridContainer.cellSize * RADIUS_RATIO;
    ctx.fillStyle = 'beige';
    ctx.strokeStyle = 'blue';
    ctx.lineWidth = BORDER_WIDTH;
    ctx.beginPath();
    if (multipleResult) {
      ctx.ellipse(width / 2, height - radius, radius, radius, 0, 0, 2 * Math.PI);
    } else {
      ctx.ellipse(width / 2, height / 2, radius, radius, 0, 0, 2 * Math.PI);
    }
    ctx.fill();
    ctx.stroke();
  }
}
