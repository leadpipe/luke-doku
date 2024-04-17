import {
  LitElement,
  ReactiveController,
  ReactiveControllerHost,
  svg,
  TemplateResult,
} from 'lit';
import {Game} from '../game/game';
import {Loc} from '../game/loc';
import {GridContainer, Point} from './types';

/** The possible results of a clock input interaction. */
export type ClockInputResult = number | 'clear' | 'multiple' | 'cancel';

const {PI, sin, cos, hypot, acos, round, sqrt} = Math;
/** How much of a grid cell the clock-face radius is. */
const RADIUS_RATIO = 0.85;
/** Pi/12: 1/24th of a circle. */
const PI_12 = PI / 12;
/** Converts from clock section to corresponding result. */
// prettier-ignore
const SECTION_RESULT: readonly ClockInputResult[] = [
  'clear',
  1, 2, 3, 4, 5, 6, 7, 8, 9,
  'multiple',
  'cancel',
];
/** The string to display in each clock section. */
const INPUT_TEXT = {
  clear: '□',
  multiple: '＋',
  cancel: '⨉',
};

function resultToText(result: ClockInputResult): string {
  return typeof result === 'number' ? String(result) : INPUT_TEXT[result];
}

/**
 * Manages the clock-face and popup multi-numeral Sudoku input mechanisms.
 */
export class SudokuInput implements ReactiveController {
  constructor(
    private readonly host: LitElement & GridContainer,
    private readonly game: Game,
  ) {
    host.addController(this);
  }

  hostConnected(): void {
    window.addEventListener('keydown', this.keyHandler);
    const {host} = this;
    host.addEventListener('pointerenter', this.hoveringHandler);
    host.addEventListener('pointermove', this.hoveringHandler);
    host.addEventListener('pointerleave', this.hoveringHandler);
    host.addEventListener('pointercancel', this.cancelHandler);
    host.addEventListener('pointerdown', this.downHandler);
    host.addEventListener('pointerup', this.upHandler);
  }

  hostDisconnected(): void {
    window.removeEventListener('keydown', this.keyHandler);
    const {host} = this;
    host.removeEventListener('pointerenter', this.hoveringHandler);
    host.removeEventListener('pointermove', this.hoveringHandler);
    host.removeEventListener('pointerleave', this.hoveringHandler);
    host.removeEventListener('pointercancel', this.cancelHandler);
    host.removeEventListener('pointerdown', this.downHandler);
    host.removeEventListener('pointerup', this.upHandler);
  }

  /** The possible input location the pointer last hovered over. */
  hoverLoc?: Loc;

  renderHoverLoc(): TemplateResult[] {
    const answer = [];
    const {hoverLoc, host, game} = this;
    const {cellCenter, cellSize} = host;
    const halfCell = cellSize / 2;
    if (hoverLoc) {
      const [x, y] = cellCenter(hoverLoc);
      answer.push(svg`
        <rect class="hover-loc"
              x=${x - halfCell}
              y=${y - halfCell}
              width=${cellSize}
              height=${cellSize}
              />`);
      if (!game.marks.getNums(hoverLoc) && !this.inputLoc) {
        answer.push(svg`
          <text x=${x} y=${y} class="hover-loc">${this.defaultNum}</text>`);
      }
    }
    return answer;
  }

  renderInGrid(): TemplateResult[] | undefined {
    const {inputLoc} = this;
    if (!inputLoc) return undefined;
    const [x, y] = this.host.cellCenter(inputLoc);
    const answer = [];
    const radius = this.host.cellSize * RADIUS_RATIO;
    answer.push(svg`
      <circle
        class="clock"
        cx=${x}
        cy=${y}
        r=${radius}
      ></circle>
    `);
    const {clockSection} = this;
    if (clockSection >= 0) {
      // Note: the arc goes from the midpoints between the clock positions
      // around the current section.  And we're using sin for the x coordinate
      // and -cos for the y, which correctly translates to SVG coordinates.
      const arcStart = (2 * clockSection - 1) * PI_12;
      const arcEnd = (2 * clockSection + 1) * PI_12;
      answer.push(svg`
        <path
          class="clock-selection"
          d="
            M ${x},${y}
            L ${x + sin(arcStart) * radius},${y - cos(arcStart) * radius}
            A ${radius} ${radius} 0 0 1
              ${x + sin(arcEnd) * radius},${y - cos(arcEnd) * radius}
            Z
          "
      `);
    }
    const textRadius = radius * 0.85;
    for (let i = 0; i < 12; ++i) {
      const angle = 2 * i * PI_12;
      answer.push(svg`
        <text
          class="clock-text"
          x=${x + sin(angle) * textRadius}
          y=${y - cos(angle) * textRadius}>
          ${resultToText(SECTION_RESULT[i])}
        </text>
      `);
    }
    const {result, currentNum} = this;
    const previewText =
      result === 'cancel' ? currentNum?.toString() ?? '' : resultToText(result);
    answer.push(svg`
      <text class="solution" x=${x} y=${y}>${previewText}</text>
    `);
    const previewRadius = radius * 0.5;
    let px = x;
    let py = y - radius - previewRadius;
    if (py < previewRadius) {
      // The preview circle is off the top of the grid.  Move it to the right,
      // tangent to the clock face circle.  (We'll also display it to the left.)
      py = previewRadius;
      const h = radius + previewRadius; // hypotenuse of the triangle
      const b = y - previewRadius; // vertical leg
      const a = sqrt(h * h - b * b); // horizontal leg
      px = x + a;
    }
    answer.push(svg`
      <circle
          class="clock"
          cx=${px}
          cy=${py}
          r=${previewRadius}
        ></circle>
      <text class="solution" x=${px} y=${py}>${previewText}</text>
    `);
    if (px !== x) {
      px = x - (px - x); // The left side
      answer.push(svg`
        <circle
            class="clock"
            cx=${px}
            cy=${py}
            r=${previewRadius}
          ></circle>
        <text class="solution" x=${px} y=${py}>${previewText}</text>
      `);
    }
    return answer;
  }

  private inputCenter?: Point;
  private inputLoc?: Loc;
  private defaultNum: number = 1;
  private result: ClockInputResult = 'cancel';
  private currentNum: number | null | undefined = null;
  private clockSection = -1;

  private convertCoordinateToCellNumber(coord: number): number | undefined {
    const sideSize = this.host.sideSize / devicePixelRatio;
    if (coord < 0 || coord >= sideSize) return undefined;
    return Math.floor(coord / (sideSize / 9));
  }

  private convertPointToLoc(point: {x: number; y: number}): Loc | undefined {
    const rect = this.host.svgElement.getBoundingClientRect();
    const {padding} = this.host;
    const col = this.convertCoordinateToCellNumber(point.x - rect.x - padding);
    const row = this.convertCoordinateToCellNumber(point.y - rect.y - padding);
    if (col === undefined || row === undefined) return undefined;
    return new Loc(row, col);
  }

  private isPossibleInputLoc(loc: Loc): boolean {
    if (this.host.isPaused) return false;
    return this.game.marks.getClue(loc) === null;
  }

  private readonly keyHandler = (event: KeyboardEvent) =>
    this.handleKeyDown(event);
  private readonly hoveringHandler = (event: PointerEvent) =>
    this.handlePointerHovering(event);
  private readonly cancelHandler = (event: PointerEvent) =>
    this.handlePointerCancel(event);
  private readonly downHandler = (event: PointerEvent) =>
    this.handlePointerDown(event);
  private readonly upHandler = (event: PointerEvent) =>
    this.handlePointerUp(event);

  private handlePointerHovering(event: PointerEvent) {
    if (this.inputLoc) {
      this.pointerMoved(event);
      return;
    }
    const loc = this.convertPointToLoc(event);
    const hoverLoc = loc && this.isPossibleInputLoc(loc) ? loc : undefined;
    if (hoverLoc !== this.hoverLoc) {
      this.hoverLoc = hoverLoc;
      this.host.requestUpdate();
    }
  }

  private handlePointerCancel(event: PointerEvent) {
    const {inputLoc} = this;
    if (inputLoc) {
      this.host.releasePointerCapture(event.pointerId);
      this.cancelInput();
      this.inputLoc = undefined;
      this.hoverLoc = inputLoc;
      this.host.requestUpdate();
    }
  }

  private handlePointerDown(event: PointerEvent) {
    const loc = this.convertPointToLoc(event);
    const {inputLoc, game} = this;
    if (!inputLoc && loc && this.isPossibleInputLoc(loc)) {
      this.inputLoc = loc;
      this.hoverLoc = undefined;
      this.host.setPointerCapture(event.pointerId);
      this.inputCenter = [event.x, event.y];
      this.currentNum = game.marks.getNum(loc);
      this.result =
        this.currentNum ?? game.marks.getNums(loc)
          ? 'multiple'
          : this.defaultNum;
      this.clockSection = -1;
      this.host.requestUpdate();
    }
  }

  private handlePointerUp(event: PointerEvent) {
    this.host.releasePointerCapture(event.pointerId);
    const {inputLoc, game} = this;
    if (inputLoc && game) {
      this.cancelInput();
      const {result} = this;
      switch (result) {
        case 'cancel':
          break;
        case 'multiple':
          // TODO: implement
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
      this.host.requestUpdate();
    }
  }

  private handleKeyDown(event: KeyboardEvent) {
    const {hoverLoc, game} = this;
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
      this.host.requestUpdate();
    }
  }

  private cancelInput() {
    this.inputCenter = undefined;
    this.inputLoc = undefined;
  }

  private pointerMoved(event: PointerEvent) {
    const {x, y} = event;
    const {inputCenter, host} = this;
    if (!inputCenter) return;
    const [centerX, centerY] = inputCenter;
    const distance = hypot(x - centerX, y - centerY);
    if (distance > host.cellSize / devicePixelRatio / 2) {
      // Figure out which clock section to light up.
      const radians =
        x >= centerX
          ? acos((centerY - y) / distance)
          : PI + acos((y - centerY) / distance);
      this.clockSection = round((6 * radians) / PI) % 12;
      this.result = SECTION_RESULT[this.clockSection];
    } else {
      // Use the default result, and no clock section (light up the center
      // instead).
      this.result = this.defaultNum;
      this.clockSection = -1;
    }
    host.requestUpdate();
  }
}
