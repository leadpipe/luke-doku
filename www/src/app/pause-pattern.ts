import {svg, SVGTemplateResult} from 'lit';
import * as wasm from 'luke-doku-rust';
import {Loc} from '../game/loc';
import {GridContainer} from './types';

/**
 * The wasm code matches the possible symmetries of the Sudoku board against the
 * clues of a given puzzle to produce one or more of these objects.
 */
export declare interface WasmSymMatch {
  full_orbits: number[][];
  num_nonconforming_locs: number;
  partial_orbits: number[][];
}

/**
 * Renders the pause overlay for a given board symmetry of a given puzzle.
 */
export class PausePattern {
  private orbits: OrbitShape[];
  readonly angle: number;
  readonly circleCenter: string;

  constructor(
    readonly sym: wasm.Sym,
    private readonly match: WasmSymMatch,
    readonly puzzle: wasm.Grid,
    readonly gridContainer: GridContainer,
    random: wasm.JsRandom,
  ) {
    const orbits = [];
    this.angle = random.range(0, 360);
    const cx = random.normal(0.5, 0.15);
    const cy = random.normal(0.5, 0.15);
    this.circleCenter = `calc(var(--size) * ${cx}) calc(var(--size) * ${cy})`;
    const chooseColor =
      sym === wasm.Sym.None
        ? newMotleyChooser(random)
        : newTwoColorChooser(random);
    const symTransform = SYM_TRANSFORMS[sym];
    for (const orbit of match.full_orbits) {
      orbits.push(
        new OrbitShape(orbit, symTransform).init(chooseColor(), random),
      );
    }
    for (const orbit of match.partial_orbits) {
      orbits.push(
        new PartialOrbitShape(orbit, symTransform, puzzle).init(
          chooseColor(),
          random,
        ),
      );
    }
    this.orbits = orbits;
  }

  isBroken(): boolean {
    return this.match.num_nonconforming_locs > 0;
  }

  render() {
    const {gridContainer, puzzle} = this;
    const answer = [];
    for (const orbit of this.orbits) {
      answer.push(orbit.render(gridContainer, puzzle));
    }
    return answer;
  }
}

class OkLCH {
  constructor(
    readonly lightness: number, // 0..100
    readonly chroma: number, // 0..100 (0..37)
    readonly hue: number, // 0..360
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

function mod(x: number, y: number): number {
  const rem = x % y;
  if (rem < 0) return rem + y;
  return rem;
}

function minmax(x: number, min: number, max: number): number {
  return x < min ? min : x > max ? max : x;
}

export class ColorRange {
  constructor(readonly name: string, readonly lo: OkLCH, readonly hi: OkLCH) {}

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
      this.lo.lightness +
        lightnessSlider * (this.hi.lightness - this.lo.lightness),
      this.lo.chroma + chromaSlider * (this.hi.chroma - this.lo.chroma),
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
      this.lo.lightness +
        lightnessSlider * (this.hi.lightness - this.lo.lightness),
      this.lo.chroma + chromaSlider * (this.hi.chroma - this.lo.chroma),
      this.lo.hue + hueSlider * (this.hi.hue - this.lo.hue),
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
export const COLOR_RANGES: ColorRange[] = [
  new ColorRange('red', new OkLCH(50, 27, -5), new OkLCH(67, 37, 16)),
  new ColorRange('orange', new OkLCH(53, 23, 44), new OkLCH(71, 37, 60)),
  new ColorRange('yellow', new OkLCH(70, 26, 84), new OkLCH(93, 37, 98)),
  new ColorRange('green', new OkLCH(50, 23, 134), new OkLCH(72, 37, 142)),
  new ColorRange('blue', new OkLCH(52, 13, 225), new OkLCH(62, 37, 260)),
  new ColorRange('purple', new OkLCH(42, 27, 295), new OkLCH(62, 37, 310)),
];

function randomColorIndex(random: wasm.JsRandom): number {
  return Math.floor(random.range(0, COLOR_RANGES.length));
}

function randomColorRange(random: wasm.JsRandom): ColorRange {
  return COLOR_RANGES[randomColorIndex(random)];
}

function newMotleyChooser(random: wasm.JsRandom): () => OkLCH {
  const lightnessSlider = random.next();
  const chromaSlider = random.next();
  return () =>
    randomColorRange(random).randomHue(random, lightnessSlider, chromaSlider);
}

function newTwoColorChooser(random: wasm.JsRandom): () => OkLCH {
  const primaryIndex = randomColorIndex(random);
  const primaryRange = COLOR_RANGES[primaryIndex];
  const primaryCenter = primaryRange.randomCenter(random);
  const secondaryIndex = mod(
    Math.floor(primaryIndex + random.normal(COLOR_RANGES.length / 2, 1)),
    COLOR_RANGES.length,
  );
  const secondaryRange = COLOR_RANGES[secondaryIndex];
  const secondaryCenter = secondaryRange.randomCenter(random);
  const primaryChance = Math.min(random.normal(0.75, 0.04), 0.98);
  return () => {
    const isPrimary = random.choice(primaryChance);
    const range = isPrimary ? primaryRange : secondaryRange;
    const center = isPrimary ? primaryCenter : secondaryCenter;
    return range.randomColorNear(random, center);
  };
}

/**
 * Keeps the shape and color used for one orbit.
 */
class OrbitShape {
  points: BezierPoint[] = [];
  color = '';

  constructor(
    readonly orbit: readonly number[],
    readonly symTransform: SymTransform,
  ) {}

  init(color: OkLCH, random: wasm.JsRandom): OrbitShape {
    this.setColor(color);
    const n = Math.floor(random.range(3, 8));
    const spokeAngle = (2 * Math.PI) / n;
    if (random.choice(0.5)) {
      const outerRadius = random.range(0.85, 1.0);
      const innerRadius = random.range(0.6, outerRadius - 0.05);
      const deltaLength1 = outerRadius / Math.max(2, random.normal(4, 1));
      const deltaLength2 = innerRadius / Math.max(2, random.normal(4, 1));
      let angle = random.range(0, 2 * Math.PI);
      const deltaAngle = (spokeAngle / 2) * random.range(0.75, 1.25);
      for (let i = 0; i < n; ++i) {
        this.points.push(bezierPoint(angle, outerRadius, deltaLength1));
        this.points.push(
          bezierPoint(angle + deltaAngle, innerRadius, deltaLength2),
        );
        angle += spokeAngle;
      }
    } else {
      let startAngle = random.range(0, 2 * Math.PI);
      let endAngle = startAngle + 2 * Math.PI;
      const radius = random.range(0.8, 0.95);
      const deltaLength = random.range(-0.1, 0.1);
      this.points[0] = bezierPoint(startAngle, radius, deltaLength);
      let i;
      for (i = 1; i < n / 2; ++i) {
        const deltaAngle = spokeAngle * random.range(0.75, 1.25);
        startAngle += deltaAngle;
        this.points[i] = bezierPoint(startAngle, radius, deltaLength);
        endAngle -= deltaAngle;
        this.points[n - i] = bezierPoint(endAngle, radius, deltaLength);
      }
      if ((n & 1) === 0) {
        this.points[i] = bezierPoint(
          (startAngle + endAngle) / 2,
          radius,
          deltaLength,
        );
      }
    }
    return this;
  }

  protected setColor(color: OkLCH) {
    this.color = color.toColor();
  }

  render(gridContainer: GridContainer, puzzle: wasm.Grid): SVGTemplateResult[] {
    const {cellCenter, cellSize, theme} = gridContainer;
    const dark = theme === 'dark';
    const answer: SVGTemplateResult[] = [];
    for (const locIndex of this.orbit) {
      const hasClue = puzzle.get(locIndex) !== 0;
      const loc = Loc.of(locIndex);
      const [dx, dy] = cellCenter(loc);
      const scale = cellSize / 2;
      // Sets the origin at the center of the cell, and scales the axes so the
      // cell borders are at ±1.
      answer.push(svg`
        <g transform="translate(${dx} ${dy}) scale(${scale})">
          ${this.renderShape(loc.row, loc.col, hasClue, dark)}
        </g>`);
    }
    return answer;
  }

  protected renderShape(
    row: number,
    col: number,
    hasClue: boolean,
    _dark: boolean,
  ): SVGTemplateResult[] {
    const renderedParts = [];
    for (const op of this.symTransform(row, col)) {
      renderedParts.push(this.renderBaseShape(hasClue, op));
    }
    return renderedParts;
  }

  private renderBaseShape(
    hasClue: boolean,
    transform: string,
  ): SVGTemplateResult {
    const {points} = this;
    const pathParts = [`M ${points[0].x},${points[0].y}`];
    for (let i = 0; i < points.length; ++i) {
      const p0 = points[i];
      const p1 = points[(i + 1) % points.length];
      pathParts.push(
        `C ${p0.x + p0.dx},${p0.y + p0.dy},${p1.x - p1.dx},${p1.y - p1.dy},${
          p1.x
        },${p1.y}`,
      );
    }
    return svg`<path fill=${this.getColor(hasClue)}
                     transform=${transform}
                     d=${pathParts.join(' ')} />`;
  }

  protected getColor(_hasClue: boolean): string {
    return this.color;
  }
}

/**
 * Modifies the shape drawn depending on whether the clue is present or absent.
 */
class PartialOrbitShape extends OrbitShape {
  missingColor = '';
  inverted: boolean;

  constructor(
    orbit: readonly number[],
    symTransform: SymTransform,
    puzzle: wasm.Grid,
  ) {
    super(orbit, symTransform);
    let numMissing = 0;
    for (const loc of orbit) {
      if (puzzle.get(loc) === 0) {
        ++numMissing;
      }
    }
    // If there are more clues missing from this orbit than set, we put the X
    // on the set clues and don't draw the shape at all.
    this.inverted = numMissing > orbit.length - numMissing;
  }

  protected override setColor(color: OkLCH) {
    this.color = color.toColor(0.85);
    this.missingColor = color.toColor(0.6);
  }

  protected override renderShape(
    row: number,
    col: number,
    hasClue: boolean,
    dark: boolean,
  ): SVGTemplateResult[] {
    let drawX;
    let renderedParts: SVGTemplateResult[];
    if (this.inverted) {
      drawX = hasClue;
      renderedParts = [];
    } else {
      renderedParts = super.renderShape(row, col, hasClue, dark);
      drawX = !hasClue;
    }
    if (drawX) {
      renderedParts.push(
        svg`<path fill="none"
                  stroke=${dark ? '#5f5f5f4c' : '#a0a0a04c'}
                  stroke-width="0.2"
                  d="
                    M -0.75,-0.75
                    L +0.75,+0.75
                    M -0.75,+0.75
                    L +0.75,-0.75"
                  />`,
      );
    }
    return renderedParts;
  }

  protected override getColor(hasClue: boolean): string {
    return hasClue ? this.color : this.missingColor;
  }
}

/**
 * An anchor point for a Bezier curve with deltas for orthogonal control points.
 */
type BezierPoint = {
  x: number;
  y: number;
  dx: number;
  dy: number;
};

function bezierPoint(
  angle: number,
  radius: number,
  deltaLength: number,
): BezierPoint {
  const x = radius * Math.cos(angle);
  const y = radius * Math.sin(angle);
  angle += Math.PI / 2;
  const dx = deltaLength * Math.cos(angle);
  const dy = deltaLength * Math.sin(angle);
  return {x, y, dx, dy};
}

type TransformOp = string;
const IDENT = '';
const ROT90 = 'rotate(-90)';
const ROT180 = 'rotate(180)';
const ROT270 = 'rotate(-270)';
const MIR_X = 'scale(1, -1)';
const MIR_Y = 'scale(-1, 1)';
const DIAG_MAIN = 'matrix(0, 1, 1, 0, 0, 0)';
const DIAG_ANTI = 'matrix(0, -1, -1, 0, 0, 0)';

/**
 * A generator of transforms for shapes.  There's one for each symmetry.
 */
type SymTransform = (row: number, col: number) => Generator<TransformOp>;

/**
 * For symmetries that don't actually transform the shapes.
 */
function* baseSymTransform(_row: number, _col: number) {
  yield IDENT;
}

function* rot90Transform(row: number, col: number) {
  if (row === 4 && col === 4) {
    yield IDENT;
    yield ROT90;
    yield ROT180;
    yield ROT270;
  } else if (row <= 4 && col < 4) {
    yield IDENT;
  } else if (row > 4 && col <= 4) {
    yield ROT90;
  } else if (row >= 4 && col > 4) {
    yield ROT180;
  } else {
    yield ROT270;
  }
}

function* rot180Transform(row: number, col: number) {
  if (row === 4 && col === 4) {
    yield IDENT;
    yield ROT180;
  } else if (row < 4 || (row === 4 && col < 4)) {
    yield IDENT;
  } else {
    yield ROT180;
  }
}

function* mirXTransform(row: number, _col: number) {
  if (row === 4) {
    yield IDENT;
    yield MIR_X;
  } else if (row < 4) {
    yield IDENT;
  } else {
    yield MIR_X;
  }
}

function* mirYTransform(_row: number, col: number) {
  if (col === 4) {
    yield IDENT;
    yield MIR_Y;
  } else if (col < 4) {
    yield IDENT;
  } else {
    yield MIR_Y;
  }
}

function* mirBothTransform(row: number, col: number) {
  if (row === 4 && col === 4) {
    yield IDENT;
    yield MIR_Y;
    yield MIR_X;
    yield ROT180;
  } else if (row === 4) {
    if (col < 4) {
      yield IDENT;
      yield MIR_X;
    } else {
      yield MIR_Y;
      yield ROT180;
    }
  } else if (col === 4) {
    if (row < 4) {
      yield IDENT;
      yield MIR_Y;
    } else {
      yield MIR_X;
      yield ROT180;
    }
  } else if (row < 4) {
    yield col < 4 ? IDENT : MIR_Y;
  } else {
    yield col < 4 ? MIR_X : ROT180;
  }
}

function* diagMainTransform(row: number, col: number) {
  if (row === col) {
    yield IDENT;
    yield DIAG_MAIN;
  } else if (row < col) {
    yield IDENT;
  } else {
    yield DIAG_MAIN;
  }
}

function* diagAntiTransform(row: number, col: number) {
  if (row === 8 - col) {
    yield IDENT;
    yield DIAG_ANTI;
  } else if (row < 8 - col) {
    yield IDENT;
  } else {
    yield DIAG_ANTI;
  }
}

function* diagBothTransform(row: number, col: number) {
  if (row === 4 && col === 4) {
    yield IDENT;
    yield DIAG_MAIN;
    yield DIAG_ANTI;
    yield ROT180;
  } else if (row === col) {
    if (row < 4) {
      yield IDENT;
      yield DIAG_MAIN;
    } else {
      yield DIAG_ANTI;
      yield ROT180;
    }
  } else if (row === 8 - col) {
    if (row < 4) {
      yield IDENT;
      yield DIAG_ANTI;
    } else {
      yield DIAG_MAIN;
      yield ROT180;
    }
  } else if (row < col) {
    yield row < 8 - col ? IDENT : DIAG_ANTI;
  } else {
    yield row < 8 - col ? DIAG_MAIN : ROT180;
  }
}

function* fullReflectTransform(row: number, col: number) {
  if (row === 4 && col === 4) {
    yield IDENT;
    yield MIR_Y;
    yield ROT270;
    yield DIAG_ANTI;
    yield ROT180;
    yield MIR_X;
    yield ROT90;
    yield DIAG_MAIN;
  } else if (row === 4) {
    if (col < 4) {
      yield IDENT;
      yield MIR_X;
    } else {
      yield MIR_Y;
      yield ROT180;
    }
  } else if (col === 4) {
    if (row < 4) {
      yield DIAG_MAIN;
      yield ROT270;
    } else {
      yield DIAG_ANTI;
      yield ROT90;
    }
  } else if (row === col) {
    if (row < 4) {
      yield IDENT;
      yield DIAG_MAIN;
    } else {
      yield DIAG_ANTI;
      yield ROT180;
    }
  } else if (row === 8 - col) {
    if (row < 4) {
      yield ROT270;
      yield MIR_Y;
    } else {
      yield ROT90;
      yield MIR_X;
    }
  } else if (row < col) {
    if (row < 8 - col) {
      yield col < 4 ? IDENT : MIR_Y;
    } else {
      yield row < 4 ? ROT270 : DIAG_ANTI;
    }
  } else {
    if (row > 8 - col) {
      yield col > 4 ? ROT180 : MIR_X;
    } else {
      yield row > 4 ? ROT90 : DIAG_MAIN;
    }
  }
}

const SYM_TRANSFORMS: {[key in wasm.Sym]: SymTransform} = {
  [wasm.Sym.Rotation180]: rot180Transform,
  [wasm.Sym.Rotation90]: rot90Transform,
  [wasm.Sym.Mirror_X]: mirXTransform,
  [wasm.Sym.Mirror_Y]: mirYTransform,
  [wasm.Sym.Diagonal_Main]: diagMainTransform,
  [wasm.Sym.Diagonal_Anti]: diagAntiTransform,
  [wasm.Sym.Blockwise_Main]: baseSymTransform,
  [wasm.Sym.Blockwise_Anti]: baseSymTransform,
  [wasm.Sym.DoubleMirror]: mirBothTransform,
  [wasm.Sym.DoubleDiagonal]: diagBothTransform,
  [wasm.Sym.FullyReflective]: fullReflectTransform,
  [wasm.Sym.None]: baseSymTransform,
};
