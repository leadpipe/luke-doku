import {
  ReactiveController,
  ReactiveControllerHost,
  svg,
  TemplateResult,
} from 'lit';
import {Loc} from '../game/loc';
import {GridContainer, Point} from './types';

/** The possible results of a clock input interaction. */
export type ClockInputResult = number | 'clear' | 'multiple' | 'cancel';

const {PI, sin, cos, hypot, acos, round} = Math;
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
 * Manages the clock-face Sudoku input mechanism.
 */
export class ClockInput implements ReactiveController {
  constructor(private readonly host: ReactiveControllerHost & GridContainer) {
    host.addController(this);
  }

  hostConnected() {}

  render(): TemplateResult[] | undefined {
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
    return answer;
  }

  private inputCenter?: Point;
  private inputLoc?: Loc;
  private defaultResult: ClockInputResult = 'cancel';
  private result: ClockInputResult = 'cancel';
  private currentNum: number | null | undefined = null;
  private clockSection = -1;

  /**
   * Starts showing the clock-face.
   * @param event The pointer event (click or touch) that started the interaction.
   * @param inputLoc The Sudoku grid location that's being input into.
   * @param defaultResult The result to return if the input is completed near the starting point.
   * @returns
   */
  startInput(
    event: PointerEvent,
    inputLoc: Loc,
    currentNum: number | null | undefined,
    defaultNum: number,
  ) {
    this.inputCenter = [event.x, event.y];
    this.inputLoc = inputLoc;
    this.defaultResult = defaultNum;
    this.result = defaultNum;
    this.currentNum = currentNum;
    this.clockSection = -1;
    this.host.requestUpdate();
  }

  cancelInput() {
    this.inputCenter = undefined;
    this.inputLoc = undefined;
  }

  completeInput(): ClockInputResult {
    this.cancelInput();
    return this.result;
  }

  pointerMoved(event: PointerEvent) {
    const {x, y} = event;
    const {inputCenter, host} = this;
    if (!inputCenter || !host) return;
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
      this.result = this.defaultResult;
      this.clockSection = -1;
    }
    host.requestUpdate();
  }
}
