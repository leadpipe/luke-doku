import * as wasm from 'luke-doku-rust';

/**
 * A color in the okLCH space.
 */
export class OkLCH {
  constructor(
    readonly lightness: number, // 0..100
    readonly chroma: number, // 0..100 (0..37)
    readonly hue: number,
  ) {}

  toColor(opacity?: number): string {
    const l = minmax(this.lightness, 0, 100);
    const c = minmax(this.chroma, 0, 37);
    const h = this.hue;
    if (opacity === undefined) {
      return `oklch(${l}% ${c}% ${h}deg)`;
    }
    return `oklch(${l}% ${c}% ${h}deg / ${opacity})`;
  }
}

export function mod(x: number, y: number): number {
  const rem = x % y;
  if (rem < 0) return rem + y;
  return rem;
}

export function minmax(x: number, min: number, max: number): number {
  return (
    x < min ? min
    : x > max ? max
    : x
  );
}

function interpolate(lo: number, hi: number, slider: number): number {
  return lo + slider * (hi - lo);
}

export class ColorRange {
  constructor(
    readonly name: string,
    readonly lo: OkLCH,
    readonly hi: OkLCH,
  ) {}

  /**
   * Makes a new OkLCH color based on this range.  Chooses a hue uniformly from
   * [lo.hue, hi.hue], and fixes lightness and chroma based on the given slider
   * values, which range from 0 to 1.
   *
   * @param random The PRNG.
   * @param lightnessSlider How far between lo and hi values of lightness to use: [0,
   * 1].
   * @param chromaSlider How far between lo and hi values of chroma to use: [0, 1].
   */
  randomHue(
    random: wasm.JsRandom,
    lightnessSlider: number,
    chromaSlider: number,
  ): OkLCH {
    return new OkLCH(
      interpolate(this.lo.lightness, this.hi.lightness, lightnessSlider),
      interpolate(this.lo.chroma, this.hi.chroma, chromaSlider),
      random.range(this.lo.hue, this.hi.hue),
    );
  }

  /**
   * Makes a new OkLCH color from this range to use as the center point for
   * further small perturbations.
   *
   * @param random The PRNG.
   */
  randomCenter(random: wasm.JsRandom): OkLCH {
    return new OkLCH(
      random.range(this.lo.lightness, this.hi.lightness),
      random.range(this.lo.chroma, this.hi.chroma),
      random.range(this.lo.hue, this.hi.hue),
    );
  }

  /**
   * Makes a color near the given center point, based on the range.
   *
   * @param random The PRNG.
   * @param center A color produced by calling `randomCenter` on this range.
   */
  randomColorNear(random: wasm.JsRandom, center: OkLCH): OkLCH {
    return new OkLCH(
      random.normal(
        center.lightness,
        stddevFor(this.hi.lightness - this.lo.lightness),
      ),
      random.normal(center.chroma, stddevFor(this.hi.chroma - this.lo.chroma)),
      random.normal(center.hue, stddevFor(this.hi.hue - this.lo.hue)),
    );
  }

  /**
   * Makes a new OkLCH color by interpolating this range using the given slider
   * values, which range from 0 to 1.
   *
   * @param lightnessSlider How far between lo and hi values of lightness to
   * use: [0, 1].
   * @param chromaSlider How far between lo and hi values of chroma to use: [0,
   * 1].
   * @param hueSlider How far between lo and hi values of hue to use: [0, 1].
   */
  interpolate(
    lightnessSlider: number,
    chromaSlider: number,
    hueSlider: number,
  ): OkLCH {
    return new OkLCH(
      interpolate(this.lo.lightness, this.hi.lightness, lightnessSlider),
      interpolate(this.lo.chroma, this.hi.chroma, chromaSlider),
      interpolate(this.lo.hue, this.hi.hue, hueSlider),
    );
  }

  /**
   * Varies a color by manipulating its lightness.
   * @param color Color to vary
   * @param lightnessSlider Different lightness value, from 0 to 1
   * @returns The original color but with a different lightness
   */
  varyLightness(color: OkLCH, lightnessSlider: number): OkLCH {
    return new OkLCH(
      interpolate(this.lo.lightness, this.hi.lightness, lightnessSlider),
      color.chroma,
      color.hue,
    );
  }
}

/**
 * Returns the standard deviation to use for normally distributed numbers given
 * a range width.
 *
 * @param width The width of the range.
 * @returns A fraction of the width.
 */
function stddevFor(width: number): number {
  return width / 10;
}

/**
 * Choosing hues uniformly from the full spectrum yields a lot of bad colors.
 * So instead we quantize on pleasing ranges.
 */
export const COLOR_RANGES: readonly ColorRange[] = [
  new ColorRange('red', new OkLCH(50, 27, -5), new OkLCH(67, 37, 16)),
  new ColorRange('orange', new OkLCH(53, 23, 44), new OkLCH(71, 37, 60)),
  new ColorRange('yellow', new OkLCH(70, 26, 84), new OkLCH(93, 37, 98)),
  new ColorRange('green', new OkLCH(50, 23, 134), new OkLCH(72, 37, 142)),
  new ColorRange('blue', new OkLCH(52, 13, 225), new OkLCH(62, 37, 260)),
  new ColorRange('purple', new OkLCH(42, 27, 295), new OkLCH(62, 37, 310)),
];

export function randomColorIndex(random: wasm.JsRandom): number {
  return Math.floor(random.range(0, COLOR_RANGES.length));
}

export function randomColorRange(random: wasm.JsRandom): ColorRange {
  return COLOR_RANGES[randomColorIndex(random)];
}
