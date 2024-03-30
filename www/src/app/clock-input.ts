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

/** How much of a grid cell the clock-face radius is. */
const RADIUS_RATIO = 0.85;
/** How many pixels of border we add to the clock faces. */
const BORDER_WIDTH = 2;
/** Converts from clock section to corresponding result. */
// prettier-ignore
const SECTION_RESULT: readonly ClockInputResult[] = [
  'clear',
  1, 2, 3, 4, 5, 6, 7, 8, 9,
  'multiple',
  'cancel',
];

/**
 * Manages the clock-face Sudoku input mechanism.
 */
export class ClockInput implements ReactiveController {
  constructor(private readonly host: ReactiveControllerHost & GridContainer) {
    host.addController(this);
  }

  hostConnected() {}

  render(): TemplateResult | undefined {
    const {inputLoc} = this;
    if (!inputLoc) return undefined;
    const point = this.host.cellCenter(inputLoc);
    return svg`
      <circle
        cx=${point[0]}
        cy=${point[1]}
        radius=${BORDER_WIDTH / 2 + this.host.cellSize * RADIUS_RATIO}
        fill="beige"
        stroke="blue"
        stroke-width=${BORDER_WIDTH}
      ></circle>
    `;
  }

  private inputCenter?: Point;
  private inputLoc?: Loc;
  private defaultSingleResult: ClockInputResult = 'cancel';
  private result: ClockInputResult = 'cancel';
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
    defaultResult: ClockInputResult,
  ) {
    this.inputCenter = [event.x, event.y];
    this.inputLoc = inputLoc;
    this.defaultSingleResult = defaultResult;
    this.result = defaultResult;
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
    const distance = Math.hypot(x - centerX, y - centerY);
    if (distance > host.cellSize / devicePixelRatio / 2) {
      // Figure out which clock section to light up.
      const radians =
        x >= centerX
          ? Math.acos((centerY - y) / distance)
          : Math.PI + Math.acos((y - centerY) / distance);
      this.clockSection = Math.round((6 * radians) / Math.PI) % 12;
      this.result = SECTION_RESULT[this.clockSection];
    } else {
      // Use the default result, and no clock section (light up the center
      // instead).
      this.result = this.defaultSingleResult;
      this.clockSection = -1;
    }
    host.requestUpdate();
  }
}
