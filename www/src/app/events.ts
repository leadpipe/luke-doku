import * as wasm from 'luke-doku-rust';
import {SymMatch} from './sym-match';

declare global {
  interface HTMLElementEventMap {
    'puzzle-selected': CustomEvent<wasm.Grid>;
    'symmetries-updated': CustomEvent<SymMatch[]>;
  }
}
