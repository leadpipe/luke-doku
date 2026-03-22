import {css} from 'lit';

export const CLUES_FONT = css`700 1.1em 'Prompt'`;
export const LOGO_FONT_FAMILY = css`'Lumanosimo'`;
export const LOGO_FONT_SIZE = css`48px`;
export const SOLUTION_FONT_FAMILY = css`'Merriweather Sans'`;
export const SOLUTION_FONT_WEIGHT = css`400`;
export const TRAILHEAD_FONT_STYLE = css`italic`;
export const TRAILHEAD_FONT_WEIGHT = css`700`;

export const HIGHLIGHT_COLOR = css`light-dark(#bdfe, #337e)`;
export const ERROR_COLOR = css`#f00`;
export const CORRECT_COLOR = css`#0f0`;

/**
 * Styles for the sizes of an interactive sudoku view.  Define --board-size as
 * the height/width of the whole view, and --board-padding as the padding around
 * the board within the view.
 */
export const INTERACTIVE_SUDOKU_VIEW_SIZES = css`
  sudoku-view {
    width: var(--board-size);
    /* Leave enough room for the default-input preview. */
    height: calc(
      var(--board-size) + (var(--board-size) - 2 * var(--board-padding)) / 9
    );
  }
`;
