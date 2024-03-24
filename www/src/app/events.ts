import * as wasm from 'luke-doku-rust';
import {PausePattern} from './pause-pattern';

declare global {
  interface HTMLElementEventMap {
    'puzzle-selected': CustomEvent<wasm.Grid>;
    'symmetries-updated': CustomEvent<PausePattern[]>;
  }
}
