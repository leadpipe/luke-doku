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

export const BLUE_BUTTON_STYLE = css`
  .blue-button {
    font-family: 'Prompt', sans-serif;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 8px 16px;
    font-size: 14px;
    font-weight: 600;
    color: #ffffff;
    background-color: light-dark(#1a73e8, #3b82f6);
    border: none;
    border-radius: 6px;
    cursor: pointer;
    text-decoration: none;
    transition: background-color 0.15s ease-in-out, transform 0.1s ease-in-out, box-shadow 0.15s ease-in-out;
    box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.05);
  }

  .blue-button:hover {
    background-color: light-dark(#1557b0, #60a5fa);
  }

  .blue-button:active {
    transform: scale(0.97);
  }

  .blue-button:focus-visible {
    outline: 2px solid light-dark(#1a73e8, #3b82f6);
    outline-offset: 2px;
  }
`;

