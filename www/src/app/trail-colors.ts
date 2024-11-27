import * as wasm from 'luke-doku-rust';
import {CluesString} from '../game/types';
import {COLOR_RANGES, mod, OkLCH, randomColorIndex} from './colors';
import { getCurrentTheme } from './prefs';

/**
 * Calculates the colors to associate with any trails for a given puzzle.  A
 * trail's color is used to display its numerals in the grid, and its summary in
 * the list of trails.
 */
export class TrailColors {
  private readonly colors: OkLCH[] = [];

  constructor(
    private readonly seed: CluesString,
  ) {}

  getColors(numTrails: number): readonly OkLCH[] {
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
      let index = randomColorIndex(random);
      const lightnessSlider = getCurrentTheme() === 'light' ? 0 : 1;
      const chromaSlider = 1; // Maximum chroma
      for (let i = 0; i < count; ++i) {
        colors.push(
          COLOR_RANGES[index].randomHue(random, lightnessSlider, chromaSlider),
        );
        index = mod(
          index + Math.floor(random.range(1, COLOR_RANGES.length)),
          COLOR_RANGES.length,
        );
      }
    } finally {
      random.free();
    }
  }
}
