import * as wasm from 'luke-doku-rust';
import {GridString} from '../game/types';
import {COLOR_RANGES, mod, randomColorIndex} from './colors';

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
      let index = randomColorIndex(random);
      const chromaSlider = 1; // Maximum chroma
      const darkSlider = 1; // Maximum lightness for dark mode
      const lightSlider = 0; // Minimum lightness for light mode
      for (let i = 0; i < count; ++i) {
        const range = COLOR_RANGES[index];
        const dark = range.randomHue(random, darkSlider, chromaSlider);
        const light = range.varyLightness(dark, lightSlider);
        colors.push(`light-dark(${light.toColor()}, ${dark.toColor()})`);
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
