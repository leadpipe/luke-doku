import * as wasm from 'luke-doku-rust';
import {GridString} from '../game/types';
import {mod, OkLCH} from './colors';

const CHROMA = 35; // 0..37
const DARK_LIGHTNESS = 90; // 0..100
const LIGHT_LIGHTNESS = 40; // 0..100
const HUE_DELTA = 77; // degrees

/**
 * Calculates the colors to associate with any trails for a given puzzle.  A
 * trail's color is used to display its numerals in the grid, and its summary in
 * the list of trails.
 */
export class TrailColors {
  private readonly colors: string[] = [];

  constructor(private readonly seed: GridString) {}

  getColors(numTrails: number): readonly string[] {
    if (numTrails > this.colors.length) {
      this.generateColors(numTrails);
    }
    return this.colors.slice(0, numTrails);
  }

  private generateColors(numTrails: number): void {
    const count = Math.floor((numTrails + 4) / 5) * 5; // Next multiple of 5 >= numTrails
    const {colors} = this;
    const random = new wasm.JsRandom(this.seed);
    try {
      colors.length = 0;
      let hue = random.range(0, 360);
      for (let i = 0; i < count; ++i) {
        const dark = new OkLCH(DARK_LIGHTNESS, CHROMA, hue);
        const light = new OkLCH(LIGHT_LIGHTNESS, CHROMA, hue);
        colors.push(`light-dark(${light.toColor()}, ${dark.toColor()})`);
        hue = mod(hue + HUE_DELTA, 360);
      }
    } finally {
      random.free();
    }
  }
}
