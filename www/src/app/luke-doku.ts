import './events';
import './gen-puzzle';
import './sudoku-view';

import {css, html, LitElement} from 'lit';
import {customElement, query, state} from 'lit/decorators.js';
import * as wasm from 'luke-doku-rust';
import {SudokuView} from './sudoku-view';
import {Theme} from './types';
import {SymMatch} from './sym-match';

const CLUES_OVERLAY = {name: 'clues', value: ''};

/** Top-level component. */
@customElement('luke-doku')
export class LukeDoku extends LitElement {
  static override styles = css`
    :host {
      margin-top: 8px;
      display: flex;
      flex-direction: row;
      justify-content: space-around;
      align-items: top;
    }

    gen-puzzle,
    #controls {
      width: 240px;
      margin-top: 32px;
    }

    sudoku-view {
      width: 380px;
      height: 380px;
    }

    #controls > div {
      margin-bottom: 8px;
      display: flex;
      align-items: baseline;
      flex-wrap: wrap;
      gap: 4px 16px;
    }

    a {
      text-decoration: underline;
      cursor: pointer;
    }
  `;

  override render() {
    const {selectedOverlayValue} = this;
    const overlayIndex = selectedOverlayValue
      ? Number(selectedOverlayValue)
      : null;
    return html`
      <gen-puzzle @puzzle-selected=${this.selectPuzzle}></gen-puzzle>
      <sudoku-view
        theme=${this.theme}
        .puzzle=${this.puzzle}
        .overlayIndex=${overlayIndex}
        padding="10"
        interactive
        @symmetries-updated=${this.updateOverlays}
      ></sudoku-view>
      <div id="controls">
        <div>
          ${this.overlays.map(({name, value}) => {
            if (value === selectedOverlayValue) {
              return html`<b>${name}</b>`;
            } else {
              return html`<a @click=${this.selectOverlay} data-value=${value}
                >${name}</a
              >`;
            }
          })}
        </div>
        <div>
          ${['light', 'dark'].map(theme => {
            if (this.theme === theme) {
              return html`<b>${theme}</b>`;
            } else {
              return html`<a @click=${this.setTheme} data-theme=${theme}
                >${theme}</a
              >`;
            }
          })}
        </div>
      </div>
    `;
  }

  private readonly darkModeQuery = window.matchMedia(
    '(prefers-color-scheme: dark)',
  );
  private readonly handleDarkModeChange = (evt: {matches: boolean}) => {
    this.theme = evt.matches ? 'dark' : 'light';
  };

  constructor() {
    super();
    this.handleDarkModeChange(this.darkModeQuery);
    this.darkModeQuery.addEventListener('change', this.handleDarkModeChange);
  }

  @state() private selectedOverlayValue = '';
  @state() private theme: Theme = 'light';
  @state() private puzzle: wasm.Grid | null = null;
  @state() private overlays: Array<{name: string; value: string}> = [
    CLUES_OVERLAY,
  ];

  private selectPuzzle(event: CustomEvent<wasm.Grid>) {
    this.puzzle = event.detail;
    this.selectedOverlayValue = '0';
  }

  private selectOverlay(event: Event) {
    const value = (event.target as HTMLElement).dataset.value ?? '';
    this.selectedOverlayValue = value;
  }

  private setTheme(event: Event) {
    const theme = (event.target as HTMLElement).dataset.theme ?? 'light';
    this.theme = theme as 'dark' | 'light';
  }

  @query('sudoku-view') sudokuView!: SudokuView;

  private updateOverlays(event: CustomEvent<SymMatch[]>) {
    this.overlays = [
      CLUES_OVERLAY,
      ...event.detail.map((symMatch, i) => {
        return {
          name: symmetryName(symMatch.sym),
          value: i.toString(),
        };
      }),
    ];
  }
}

function symmetryName(sym: wasm.Sym): string {
  switch (sym) {
    case wasm.Sym.Blockwise_Anti:
    case wasm.Sym.Blockwise_Main:
      return 'translation';
    case wasm.Sym.Diagonal_Anti:
    case wasm.Sym.Diagonal_Main:
      return 'diagonal';
    case wasm.Sym.DoubleDiagonal:
      return 'diagonal/rotation';
    case wasm.Sym.Mirror_X:
    case wasm.Sym.Mirror_Y:
      return 'mirror';
    case wasm.Sym.DoubleMirror:
      return 'mirror/rotation';
    case wasm.Sym.Rotation180:
    case wasm.Sym.Rotation90:
      return 'rotation';
    case wasm.Sym.FullyReflective:
      return 'mirror/diagonal/rotation';
  }
  return 'none';
}

declare global {
  interface HTMLElementTagNameMap {
    'luke-doku': LukeDoku;
  }
}
