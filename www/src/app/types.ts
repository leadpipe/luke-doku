import {Loc} from '../game/loc';

export type Theme = 'dark' | 'light';

export type Point = [number, number];

/** Gives information about the Sudoku grid's display. */
export interface GridContainer {
  /** The SVG that displays the grid. */
  readonly svgElement: SVGElement;

  /** Padding in CSS pixels around the edges of the grid. */
  readonly padding: number;

  /** The size of each side of each cell in the grid, in device pixels. */
  readonly cellSize: number;

  /** The size of each side of the grid, in device pixels. */
  readonly sideSize: number;

  /**
   * Calculates the center point of the cell at the given row and column, which
   * are both between 0 and 8 inclusive.  In device pixels.
   */
  cellCenter(loc: Loc): Point;

  readonly theme: Theme;

  /** TODO: move this to Game */
  readonly isPaused: boolean;
}
