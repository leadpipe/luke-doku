import {Loc} from '../game/loc';

export type Theme = 'dark' | 'light';

export type Point = [number, number];

/** Gives information about the Sudoku grid's display. */
export interface GridContainer {
  /** The element that encompasses the grid. */
  readonly element: Element;

  /** The size of each side of each cell in the grid, in CSS pixels. */
  readonly cellSize: number;

  /**
   * Calculates the center point of the cell at the given row and column, which
   * are both between 0 and 8 inclusive.  In CSS pixels.
   */
  cellCenter(loc: Loc): Point;

  readonly theme: Theme;
}
