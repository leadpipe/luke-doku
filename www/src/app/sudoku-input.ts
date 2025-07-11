import {html, LitElement, ReactiveController, svg, TemplateResult} from 'lit';
import {classMap} from 'lit/directives/class-map.js';
import {map} from 'lit/directives/map.js';
import {Game, PlayState} from '../game/game';
import {iota} from '../game/iota';
import {Loc} from '../game/loc';
import {customEvent} from './events';
import {
  cssPixels,
  devicePixels,
  GridContainer,
  Point,
  toCss,
  toDevice,
  toPoint,
} from './types';

/** The possible results of a clock input interaction. */
export type ClockInputResult = number | 'clear' | 'multiple' | 'cancel';

const {PI, sin, cos, hypot, acos, round, floor, sqrt} = Math;
/** How much of a grid cell the clock-face radius is. */
const RADIUS_RATIO = 0.85;
/** Pi/12: 1/24th of a circle, half of a clock sector. */
const PI_12 = PI / 12;
/** How far apart the multi-input circles are from each other. */
const MULTI_INPUT_GAP = devicePixels(3);
/** The square root of 3. */
const SQRT_3 = sqrt(3);
/** Converts from clock section to corresponding result. */
// prettier-ignore
const SECTION_RESULT: readonly ClockInputResult[] = [
  'clear',
  1, 2, 3, 4, 5, 6, 7, 8, 9,
  'multiple',
  'cancel',
];
/** Where 'multiple' appears on the clock face. */
const MULTIPLE_INDEX = SECTION_RESULT.indexOf('multiple');
/** Where 'cancel' appears on the clock face. */
const CANCEL_INDEX = SECTION_RESULT.indexOf('cancel');
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
      if (game.isBlank(hoverLoc) && !this.inputLoc) {
        const {activeTrail} = game.trails;
        answer.push(svg`
          <text x=${x} y=${y} class=${
            activeTrail?.isEmpty ?
              `hover-loc trail trail-index-0 trail-${activeTrail.id} trailhead`
            : activeTrail ?
              `hover-loc trail trail-index-0 trail-${activeTrail.id}`
            : 'hover-loc'
          }>
            ${resultToText(this.defaultResult)}
          </text>`);
      }
    }
    return answer;
  }

  renderInGrid(): TemplateResult[] | TemplateResult | undefined {
    const {inputLoc, multiInput} = this;
    if (!inputLoc) return;
    const multipleOk = !this.game.trails.active;
    const [x, y] = this.host.cellCenter(inputLoc);
    const radius = this.host.cellSize * RADIUS_RATIO;
    if (multiInput) {
      return svg`
        <circle
          class="multi-input-target"
          cx=${x}
          cy=${y}
          r=${radius}
        ></circle>
      `;
    }
    const answer = [
      svg`
        <circle
          class="clock"
          cx=${x}
          cy=${y}
          r=${radius}
        ></circle>
    `,
    ];
    const {clockSection} = this;
    if (clockSection >= 0) {
      // Note: the arc goes from the midpoints between the clock positions
      // around the current section.  And we're using sin for the x coordinate
      // and -cos for the y, which correctly translates to SVG coordinates.
      let arcStart = (2 * clockSection - 1) * PI_12;
      let arcEnd = (2 * clockSection + 1) * PI_12;
      if (!multipleOk) {
        if (clockSection === MULTIPLE_INDEX) {
          arcEnd = (2 * CANCEL_INDEX + 1) * PI_12;
        } else if (clockSection === CANCEL_INDEX) {
          arcStart = (2 * MULTIPLE_INDEX - 1) * PI_12;
        }
      }
      answer.push(svg`
        <path
          class="clock-selection"
          d="
            M ${x},${y}
            L ${x + sin(arcStart) * radius},${y - cos(arcStart) * radius}
            A ${radius} ${radius} 0 0 1
              ${x + sin(arcEnd) * radius},${y - cos(arcEnd) * radius}
            Z
          "></path>
      `);
    }
    const textRadius = radius * 0.85;
    for (let i = 0; i < 12; ++i) {
      if (multipleOk || i < MULTIPLE_INDEX) {
        const angle = 2 * i * PI_12;
        answer.push(svg`
          <text
            class="clock-text"
            x=${x + sin(angle) * textRadius}
            y=${y - cos(angle) * textRadius}>
            ${resultToText(SECTION_RESULT[i])}
          </text>
      `);
      } else if (i === CANCEL_INDEX) {
        const angle = (2 * i - 1) * PI_12;
        answer.push(svg`
          <text
            class="clock-text"
            x=${x + sin(angle) * textRadius}
            y=${y - cos(angle) * textRadius}>
            ${resultToText(SECTION_RESULT[i])}
          </text>
      `);
      }
    }
    let {result, defaultResult, currentNum} = this;
    if (result === 'default') {
      result = defaultResult;
    }
    const previewText =
      result === 'cancel' ?
        (currentNum?.toString() ?? '')
      : resultToText(result);
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
      px = devicePixels(x + a);
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
      px = devicePixels(x - (px - x)); // The left side
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

  renderMultiInputPopup() {
    const {multiInput, host, inputLoc, multiHover} = this;
    if (!multiInput || !inputLoc) return; // We're not in multi-input mode, so we don't render anything.

    // TODO: support a vertical orientation aligned to the right of the grid.
    const rect = host.svgElement.getBoundingClientRect();
    const gridWidth = cssPixels(rect.width);
    const {cellSize, sideSize, padding} = host;
    const sideCenter = sideSize / 2;
    const svgPadding = toDevice(padding);
    const radius = devicePixels(cellSize / 2);
    const bgRadius = radius + MULTI_INPUT_GAP;
    const centerLine1 = radius + MULTI_INPUT_GAP;
    const centersGap = cellSize + MULTI_INPUT_GAP;
    const halfCentersGap = centersGap / 2;
    const centerStripHeight = SQRT_3 * halfCentersGap;
    const centerLine2 = centerLine1 + centerStripHeight;
    const popupHeight = devicePixels(centerLine2 + radius + MULTI_INPUT_GAP);
    const nums = this.game.marks.getNums(inputLoc);
    this.sideCenter = devicePixels(sideCenter);
    this.halfCentersGap = devicePixels(halfCentersGap);
    return html`
      <svg
        id="multi-input-popup"
        viewBox="${-svgPadding} 0 ${toDevice(gridWidth)} ${popupHeight}"
        width="100"
        height="100"
        style="
          width: ${gridWidth}px;
          height: ${toCss(popupHeight)}px;
          position: fixed;
          left: ${rect.left}px;
          top: ${rect.bottom - padding}px;
        "
      >
        <style>
          .multi-input-background {
            stroke-width: ${2 * bgRadius};
          }
        </style>
        <path
          class="multi-input-background"
          d="
                M ${sideCenter},${centerLine1}
                h ${3 * centersGap}
                h ${-centersGap}
                l ${-halfCentersGap},${centerStripHeight}
                h ${-3 * centersGap}
                l ${-halfCentersGap},${-centerStripHeight}
                z
              "
        ></path>
        ${map(iota(9), i => {
          const num = i + 1;
          const classes = {
            selected: nums?.has(num) ?? false,
            'hover-loc': multiHover === num,
          };
          const x =
            i < 5 ?
              sideCenter + (i - 2) * centersGap
            : sideCenter + halfCentersGap + (i - 7) * centersGap;
          const y = i < 5 ? centerLine1 : centerLine2;
          return svg`
            <circle
              class="multi-input-num ${classMap(classes)}"
              r=${radius}
              cx=${x}
              cy=${y}></circle>
            <text
              class="solution ${classMap(classes)}"
              x=${x}
              y=${y}>
              ${num}
            </text>
          `;
        })}
        <rect
          class="${multiHover === 'cancel' ? 'hover-loc' : ''}"
          x=${sideCenter + 3 * centersGap - radius / 2 - MULTI_INPUT_GAP}
          y=${centerLine1 - radius / 2 - MULTI_INPUT_GAP}
          width=${radius + 2 * MULTI_INPUT_GAP}
          height=${radius + 2 * MULTI_INPUT_GAP}
          fill="none"
        ></rect>
        <text
          class="solution ${multiHover === 'cancel' ? 'hover-loc' : ''}"
          x=${sideCenter + 3 * centersGap}
          y=${centerLine1}
        >
          ${INPUT_TEXT['cancel']}
        </text>
      </svg>
    `;
  }

  private hoverLoc?: Loc;
  private inputCenter?: Point;
  private inputLoc?: Loc;
  private multiInput?: Set<number>;
  private lastMultiInput?: Set<number>;
  private defaultResult: ClockInputResult = 1;
  private result: ClockInputResult | 'default' = 'default';
  private currentNum: number | null | undefined = null;
  private clockSection = -1;
  private sideCenter = devicePixels(0);
  private halfCentersGap = devicePixels(0);
  private multiHover?: ClockInputResult;
  private negatedNums: Array<Set<number> | null> = Array(81).fill(null);

  private convertCoordinateToCellNumber(coord: number): number | undefined {
    const sideSize = toCss(this.host.sideSize);
    if (coord < 0 || coord >= sideSize) return undefined;
    return Math.floor(coord / (sideSize / 9));
  }

  private convertEventToLoc(event: MouseEvent): Loc | undefined {
    const rect = this.host.svgElement.getBoundingClientRect();
    const {padding} = this.host;
    const col = this.convertCoordinateToCellNumber(event.x - rect.x - padding);
    const row = this.convertCoordinateToCellNumber(event.y - rect.y - padding);
    if (col === undefined || row === undefined) return undefined;
    return Loc.of(row, col);
  }

  /** Finds the number, or the close button, on the multi-input popup. */
  private convertMultiInputEventToResult(
    event: MouseEvent,
  ): ClockInputResult | undefined {
    const {multiInputPopup, padding} = this.host;
    if (!multiInputPopup) return;
    const rect = multiInputPopup.getBoundingClientRect();
    if (event.y < rect.top || event.y > rect.bottom) return;
    const {sideCenter, halfCentersGap} = this;
    const x = cssPixels(event.x - rect.x - padding);
    const y = cssPixels(event.y - rect.y);
    // Evens from 0 correspond to the top row, odds from 1 to the bottom row.
    const halfColumn = floor((toDevice(x) - sideCenter) / halfCentersGap) + 5;
    const topRow = y < rect.height / 2;
    const num = topRow ? 1 + (halfColumn >> 1) : 6 + ((halfColumn - 1) >> 1);
    if (topRow) {
      if (num === 6) return 'cancel';
      if (num < 6) return num;
      return undefined;
    }
    if (num >= 6 && num <= 9) return num;
    return undefined;
  }

  private isPossibleInputLoc(loc: Loc): boolean {
    if (this.game.playState !== PlayState.RUNNING) return false;
    return this.game.sudoku.clues.get(loc) === null;
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
    const {multiInput} = this;
    if (this.inputLoc && !multiInput) {
      this.pointerMoved(event);
      return;
    }
    if (multiInput) {
      const result = this.convertMultiInputEventToResult(event);
      if (result !== this.multiHover) {
        this.multiHover = result;
        this.host.requestUpdate();
      }
      if (result) return;
    }
    const loc = this.convertEventToLoc(event);
    const hoverLoc = loc && this.isPossibleInputLoc(loc) ? loc : undefined;
    this.fixMultipleDefaultResult();
    if (hoverLoc !== this.hoverLoc) {
      this.hoverLoc = hoverLoc;
      this.host.requestUpdate();
    }
  }

  private fixMultipleDefaultResult() {
    if (this.defaultResult === 'multiple' && this.game.trails.active) {
      this.defaultResult = 1;
    }
  }

  private handlePointerCancel(event: PointerEvent) {
    const {inputLoc} = this;
    if (inputLoc) {
      this.host.releasePointerCapture(event.pointerId);
      this.cancelInput();
      this.hoverLoc = inputLoc;
      this.host.requestUpdate();
    }
  }

  private handlePointerDown(event: PointerEvent) {
    const {multiInput} = this;
    if (multiInput) {
      const result = this.convertMultiInputEventToResult(event);
      if (result) {
        if (typeof result === 'string') {
          // i.e. result = cancel
          this.cancelInput();
        } else {
          this.toggleMultiInput(result);
        }
        this.host.requestUpdate();
        return;
      }
    }
    const loc = this.convertEventToLoc(event);
    if (multiInput) {
      const prev = this.inputLoc?.index;
      this.cancelInput();
      if (prev === loc?.index) {
        this.host.requestUpdate();
        return;
      }
    }
    const {inputLoc, game} = this;
    if (!inputLoc && loc && this.isPossibleInputLoc(loc)) {
      this.lastMultiInput = multiInput;
      this.fixMultipleDefaultResult();
      this.inputLoc = loc;
      this.hoverLoc = undefined;
      this.host.setPointerCapture(event.pointerId);
      this.inputCenter = toPoint(event);
      this.currentNum = game.getNum(loc);
      const nums = game.getNums(loc);
      this.result =
        this.currentNum ??
        (nums && !nums.has(this.defaultResult as number) ?
          'multiple'
        : 'default');
      this.clockSection = -1;
      this.host.requestUpdate();
    }
  }

  private handlePointerUp(event: PointerEvent) {
    this.host.releasePointerCapture(event.pointerId);
    if (this.multiInput) return;
    const {inputLoc, game} = this;
    if (inputLoc) {
      let {result, defaultResult} = this;
      if (result === 'default') {
        result = defaultResult;
      }
      switch (result) {
        case 'cancel':
          break;
        case 'multiple':
          if (
            defaultResult === 'multiple' &&
            this.lastMultiInput &&
            !game.getNums(inputLoc)
          ) {
            const nums = (this.multiInput = new Set(this.lastMultiInput));
            if (nums.size) {
              game.setNums(inputLoc, nums);
            } else {
              game.clearCell(inputLoc);
            }
          } else {
            this.defaultResult = result;
            this.multiInput = new Set(game.marks.getNums(inputLoc));
          }
          this.host.requestUpdate();
          return; // Skip the cleanup required for the other results: we're still in input mode.
        case 'clear':
          game.clearCell(inputLoc);
          this.cellModified(inputLoc);
          break;
        default:
          if (game.getNum(inputLoc) !== result) {
            this.applyNumToLoc(game, inputLoc, result);
          }
          break;
      }
      this.cancelInput();
      this.hoverLoc = inputLoc;
      this.host.requestUpdate();
    }
  }

  private applyNumToLoc(game: Game, loc: Loc, num: number) {
    const {negatedNums} = this;
    if (negatedNums[loc.index]?.has(num) && game.getNums(loc)?.has(num)) {
      // If this numeral has been negated, remove it from the cell.
      negatedNums[loc.index]?.delete(num);
      const nums = new Set(game.getNums(loc));
      nums.delete(num);
      game.setNums(loc, nums);
    } else {
      game.setNum(loc, num);
      // Negate this numeral in all the peer locations that include it as part
      // of a set.
      for (const peer of loc.getPeers()) {
        const nums = game.getNums(peer);
        if (nums && nums.size > 1 && nums.has(num)) {
          if (!negatedNums[peer.index]) {
            negatedNums[peer.index] = new Set();
          }
          negatedNums[peer.index]?.add(num);
        }
      }
    }
    this.cellModified(loc);
    this.checkSolved(game);
    this.defaultResult = num;
  }

  isNegated(num: number, loc: Loc): boolean {
    return this.negatedNums[loc.index]?.has(num) ?? false;
  }

  private checkSolved(game: Game) {
    if (!game.trails.active && game.marks.asGrid().isSolved()) {
      this.host.dispatchEvent(
        customEvent('puzzle-solved', {
          detail: undefined,
          bubbles: true,
          composed: true,
        }),
      );
    }
  }

  private cellModified(loc: Loc) {
    this.host.dispatchEvent(
      customEvent('cell-modified', {
        detail: loc,
        bubbles: true,
        composed: true,
      }),
    );
  }

  private handleKeyDown(event: KeyboardEvent) {
    const {hoverLoc, game, multiInput} = this;
    let update = false;
    switch (event.key) {
      case 'Backspace':
      case 'Delete':
        // If we're in multi-input mode, remove the last number from the set.
        if (multiInput) {
          const last = [...multiInput].pop();
          if (last) {
            this.toggleMultiInput(last);
            update = true;
          }
        }
        // If we're hovering over a set cell, clear it.
        else if (hoverLoc && game.getNums(hoverLoc)) {
          game.clearCell(hoverLoc);
          this.cellModified(hoverLoc);
          update = true;
        }
        break;

      case 'Escape':
      case 'Enter':
        if (multiInput) {
          this.cancelInput();
          update = true;
        }
        break;

      case '+':
      case '=':
        // Set the default result to multi-input.  And enter multi-input mode,
        // if we're hovering over a cell.  But ignore if trails are active.
        if (game.trails.active) break;
        this.defaultResult = 'multiple';
        if (hoverLoc) {
          this.inputLoc = hoverLoc;
          this.multiInput = new Set(game.marks.getNums(hoverLoc));
        }
        update = true;
        break;

      default:
        // If it's a numeral, change the default input to it.  If we're hovering
        // over a cell also set the cell to it.  Else, if we're in multi-input
        // mode, toggle its inclusion.
        if (event.key.length === 1 && event.key >= '1' && event.key <= '9') {
          const num = Number(event.key);
          if (
            hoverLoc &&
            !game.marks.getClue(hoverLoc) &&
            (!multiInput || hoverLoc !== this.inputLoc)
          ) {
            this.applyNumToLoc(game, hoverLoc, num);
            if (multiInput) {
              this.cancelInput();
            }
          } else if (multiInput) {
            this.toggleMultiInput(num);
          } else {
            this.defaultResult = num;
          }
          update = true;
        }
        break;
    }
    if (update) {
      this.host.requestUpdate();
    }
  }

  private toggleMultiInput(num: number) {
    const {multiInput, inputLoc, game} = this;
    if (!multiInput || !inputLoc) return;
    if (multiInput.has(num)) {
      multiInput.delete(num);
    } else {
      multiInput.add(num);
    }
    if (multiInput.size) {
      game.setNums(inputLoc, multiInput);
      this.cellModified(inputLoc);
      this.checkSolved(game);
    } else {
      game.clearCell(inputLoc);
      this.cellModified(inputLoc);
    }
  }

  private cancelInput() {
    this.inputCenter = undefined;
    this.inputLoc = undefined;
    this.multiInput = undefined;
  }

  private pointerMoved(event: PointerEvent) {
    const {inputCenter, host} = this;
    if (!inputCenter) return;
    const [x, y] = toPoint(event);
    const [centerX, centerY] = inputCenter;
    const distance = hypot(x - centerX, y - centerY);
    if (distance > host.cellSize / 2) {
      // Figure out which clock section to light up.
      const radians =
        x >= centerX ?
          acos((centerY - y) / distance)
        : PI + acos((y - centerY) / distance);
      this.clockSection = round((6 * radians) / PI) % 12;
      this.result = SECTION_RESULT[this.clockSection];
      if (this.result === 'multiple' && this.game.trails.active) {
        this.result = 'cancel';
      }
    } else {
      // Use the default result, and no clock section (light up the center
      // instead).
      this.result = 'default';
      this.clockSection = -1;
    }
    host.requestUpdate();
  }
}
