import type {TemplateResult} from 'lit';
import type {ClassInfo} from 'lit/directives/class-map.js';
import {Loc} from '../game/loc';
import {Branded} from '../game/types';

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
}
