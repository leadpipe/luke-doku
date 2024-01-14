import {Loc} from '../game/loc';

export type Theme = 'dark' | 'light';

export type Point = [number, number];

/** Gives information about the Sudoku grid. */
export interface GridCanvasContainer {
  /** The canvas the grid inhabits. */
  readonly canvas: HTMLCanvasElement;

  /** The canvas's context'. */
  readonly ctx: CanvasRenderingContext2D;

  /** The size of each side of each cell in the grid. */
  readonly cellSize: number;

  /**
   * Calculates the center point of the cell at the given row and column, which
   * are both between 0 and 8 inclusive.
   */
  cellCenter(loc: Loc): Point;

  readonly theme: Theme;
}
