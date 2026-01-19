import type {TemplateResult} from 'lit';
import type {ClassInfo} from 'lit/directives/class-map.js';
import {Loc} from '../game/loc';
import {Branded} from '../game/types';
import type { PlayState } from '../game/game';

export type Theme = 'dark' | 'light';
export type ThemeOrAuto = Theme | 'auto';

export type DevicePixels = Branded<number, 'DevicePixels'>;
export type CssPixels = Branded<number, 'CssPixels'>;

export function devicePixels(value: number): DevicePixels {
  return value as DevicePixels;
}

export function cssPixels(value: number): CssPixels {
  return value as CssPixels;
}

export function toDevice(pixels: CssPixels): DevicePixels {
  return devicePixels(pixels * devicePixelRatio);
}

export function toCss(pixels: DevicePixels): CssPixels {
  return cssPixels(pixels / devicePixelRatio);
}

export type Point = [DevicePixels, DevicePixels];

export function toPoint({x, y}: MouseEvent): Point {
  return [toDevice(cssPixels(x)), toDevice(cssPixels(y))];
}

/** Gives information about the Sudoku grid's display. */
export interface GridContainer {
  /** The SVG that displays the grid. */
  readonly svgElement: SVGElement;

  /** The SVG that displays the multi-input popup. */
  readonly multiInputPopup?: SVGElement;

  /** Padding around the edges of the grid. */
  readonly padding: CssPixels;

  /** The size of each side of each cell in the grid. */
  readonly cellSize: DevicePixels;

  /** The size of each side of the grid. */
  readonly sideSize: DevicePixels;

  /** Calculates the center point of the cell at the given location. */
  cellCenter(loc: Loc): Point;

  /** Renders a multi-value cell. */
  pushMultiValueCell(
    nums: ReadonlySet<number>,
    x: number,
    y: number,
    withTrail: boolean,
    isHoverLoc: boolean,
    isInputLoc: boolean,
    classesForNum: (num: number) => ClassInfo,
    answer: TemplateResult[],
  ): void;

  /** Tells whether input should be accepted at this time. */
  shouldAcceptInput(): boolean;

  /** Tells whether the given location is a blank cell. */
  isBlank(loc: Loc): boolean;

  /** Tells whether the given location can be written to. */
  canBeWritten(loc: Loc): boolean;

  /** Returns the single value at the location, or null if multiple/none. */
  getNum(loc: Loc): number | null | undefined;

  /** Returns all possible values at the location. */
  getNums(loc: Loc): ReadonlySet<number> | null | undefined;

  /** Sets a single value at the location. */
  setNum(loc: Loc, num: number): void;

  /** Sets multiple possible values at the location. */
  setNums(loc: Loc, nums: Set<number>): void;

  /** Clears the location. */
  clearCell(loc: Loc): void;

  /** Returns the active trail, if any. */
  getActiveTrail(): {isEmpty: boolean; id: number} | null | undefined;

  /** Tells whether trails are currently active. */
  areTrailsActive(): boolean;

  /** Tells whether multi-input mode can be entered. */
  canBeMultiInput(): boolean;

  /** Tells whether the puzzle is solved. */
  isSolved(): boolean;

  /** Tells whether a value is negated at a location. */
  isNegated(loc: Loc, num: number): boolean;
}
