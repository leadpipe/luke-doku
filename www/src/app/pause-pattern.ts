import {svg, SVGTemplateResult} from 'lit';
import * as wasm from 'luke-doku-rust';
import {ReadonlyGrid} from '../game/grid';
import {Loc} from '../game/loc';
import {SymMatch} from '../game/sudoku';
import {GridContainer} from './types';
import {
  COLOR_RANGES,
  mod,
  OkLCH,
  randomColorIndex,
  randomColorRange,
} from './colors';

/**
 * Renders the pause overlay for a given board symmetry of a given puzzle.
 */
export class PausePattern {
  private orbits: OrbitShape[];
  private readonly angle: number;
  private readonly circleCenter: string;

  constructor(
    private readonly symMatch: SymMatch,
    private readonly clues: ReadonlyGrid,
    private readonly gridContainer: GridContainer,
  ) {
    const random = new wasm.JsRandom(clues.toFlatString());
    try {
      const orbits = [];
      this.angle = random.range(0, 360);
      const cx = random.normal(0.5, 0.15);
      const cy = random.normal(0.5, 0.15);
      this.circleCenter = `calc(var(--size) * ${cx}) calc(var(--size) * ${cy})`;
      const chooseColor =
        symMatch.sym === wasm.Sym.None
          ? newMotleyChooser(random)
          : newTwoColorChooser(random);
      const symTransform = SYM_TRANSFORMS[symMatch.sym];
      for (const orbit of symMatch.fullOrbits) {
        orbits.push(
          new OrbitShape(orbit, symTransform).init(chooseColor(), random),
        );
      }
      for (const orbit of symMatch.partialOrbits) {
        orbits.push(
          new PartialOrbitShape(orbit, symTransform, clues).init(
            chooseColor(),
            random,
          ),
        );
      }
      this.orbits = orbits;
    } finally {
      random.free();
    }
  }

  isBroken(): boolean {
    return this.symMatch.numNonconformingLocs > 0;
  }

  renderBackground() {
    const {sideSize} = this.gridContainer;
    return svg`
        <style>
          .bg {
            width: 100%;
            height: 100%;
            ${this.renderBgClass()}
          }
          .x {
            fill: none;
            stroke: light-dark('#5f5f5f4c', '#a0a0a04c');
            stroke-width: 0.2;
          }
        </style>
        <foreignObject
          x="0"
          y="0"
          width=${sideSize}
          height=${sideSize}
        >
          <div class="bg"></div>
        </foreignObject>
    `;
  }

  renderPattern() {
    const {gridContainer, clues} = this;
    const answer = [];
    for (const orbit of this.orbits) {
      answer.push(orbit.render(gridContainer, clues));
    }
    return answer;
  }

  private renderBgClass() {
    switch (this.symMatch.sym) {
      case wasm.Sym.Rotation180:
        return svg`
          --angle: ${this.angle}deg;
          background: conic-gradient(
            from var(--angle) at 50%,
            var(--gc),
            var(--gf) 50%,
            var(--gc) 50%,
            var(--gf)
          );
        `;
      case wasm.Sym.Rotation90:
        return svg`
          --angle: ${this.angle}deg;
          background: conic-gradient(
            from var(--angle) at 50%,
            var(--gc),
            var(--gf) 25%,
            var(--gc) 25%,
            var(--gf) 50%,
            var(--gc) 50%,
            var(--gf) 75%,
            var(--gc) 75%,
            var(--gf)
          );
        `;
      case wasm.Sym.Mirror_X:
        return svg`
          background: linear-gradient(
            0deg,
            var(--gf),
            var(--gd) 35%,
            var(--ga) 45%,
            var(--g9) 50%,
            var(--ga) 55%,
            var(--gd) 65%,
            var(--gf)
          );
        `;
      case wasm.Sym.Mirror_Y:
        return svg`
          background: linear-gradient(
            90deg,
            var(--gf),
            var(--gd) 35%,
            var(--ga) 45%,
            var(--g9) 50%,
            var(--ga) 55%,
            var(--gd) 65%,
            var(--gf)
          );
        `;
      case wasm.Sym.Diagonal_Main:
        return svg`
          background: linear-gradient(
            45deg,
            var(--gf),
            var(--gd) 35%,
            var(--ga) 45%,
            var(--g9) 50%,
            var(--ga) 55%,
            var(--gd) 65%,
            var(--gf)
          );
        `;
      case wasm.Sym.Diagonal_Anti:
        return svg`
          background: linear-gradient(
            -45deg,
            var(--gf),
            var(--gd) 35%,
            var(--ga) 45%,
            var(--g9) 50%,
            var(--ga) 55%,
            var(--gd) 65%,
            var(--gf)
          );
        `;
      case wasm.Sym.Blockwise_Main:
        return svg`
          background: linear-gradient(
            45deg,
            var(--gc) 0,
            var(--gf) 16.67%,
            var(--gc) 16.67%,
            var(--gf) 33.33%,
            var(--gc) 33.33%,
            var(--gf) 50%,
            var(--gc) 50%,
            var(--gf) 66.67%,
            var(--gc) 66.67%,
            var(--gf) 83.33%,
            var(--gc) 83.33%,
            var(--gf) 100%
          );
        `;
      case wasm.Sym.Blockwise_Anti:
        return svg`
          background: linear-gradient(
            135deg,
            var(--gc) 0,
            var(--gf) 16.67%,
            var(--gc) 16.67%,
            var(--gf) 33.33%,
            var(--gc) 33.33%,
            var(--gf) 50%,
            var(--gc) 50%,
            var(--gf) 66.67%,
            var(--gc) 66.67%,
            var(--gf) 83.33%,
            var(--gc) 83.33%,
            var(--gf) 100%
          );
        `;
      case wasm.Sym.DoubleMirror:
        return svg`
          background: conic-gradient(
            from 0deg at 50%,
            var(--gf),
            var(--gd) 15%,
            var(--ga) 25%,
            var(--gd) 35%,
            var(--gf) 50%,
            var(--gd) 65%,
            var(--ga) 75%,
            var(--gd) 85%,
            var(--gf)
          );
        `;
      case wasm.Sym.DoubleDiagonal:
        return svg`
          background: conic-gradient(
            from 45deg at 50%,
            var(--gf),
            var(--gd) 15%,
            var(--ga) 25%,
            var(--gd) 35%,
            var(--gf) 50%,
            var(--gd) 65%,
            var(--ga) 75%,
            var(--gd) 85%,
            var(--gf)
          );
        `;
      case wasm.Sym.FullyReflective:
        return svg`
          background: conic-gradient(
            from 45deg at 50%,
            var(--gf),
            var(--gd) 7.5%,
            var(--ga) 12.5%,
            var(--gd) 17.5%,
            var(--gf) 25%,
            var(--gd) 32.5%,
            var(--ga) 37.5%,
            var(--gd) 42.5%,
            var(--gf) 50%,
            var(--gd) 57.5%,
            var(--ga) 62.5%,
            var(--gd) 67.5%,
            var(--gf) 75%,
            var(--gd) 82.5%,
            var(--ga) 87.5%,
            var(--gd) 92.5%,
            var(--gf)
          );
        `;
      case wasm.Sym.None:
        return svg`
          background: radial-gradient(
            circle at ${this.circleCenter},
            var(--g8),
            var(--ga) 15%,
            var(--gd) 40%,
            var(--gf) 90%
          );
        `;
    }
  }
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
    readonly orbit: readonly Loc[],
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

  render(
    gridContainer: GridContainer,
    clues: ReadonlyGrid,
  ): SVGTemplateResult[] {
    const {cellCenter, cellSize} = gridContainer;
    const answer: SVGTemplateResult[] = [];
    for (const loc of this.orbit) {
      const hasClue = clues.get(loc) != null;
      const [dx, dy] = cellCenter(loc);
      const scale = cellSize / 2;
      // Sets the origin at the center of the cell, and scales the axes so the
      // cell borders are at ±1.
      answer.push(svg`
        <g transform="translate(${dx} ${dy}) scale(${scale})">
          ${this.renderShape(loc.row, loc.col, hasClue)}
        </g>`);
    }
    return answer;
  }

  protected renderShape(
    row: number,
    col: number,
    hasClue: boolean,
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
    orbit: readonly Loc[],
    symTransform: SymTransform,
    clues: ReadonlyGrid,
  ) {
    super(orbit, symTransform);
    let numMissing = 0;
    for (const loc of orbit) {
      if (clues.get(loc) == null) {
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
  ): SVGTemplateResult[] {
    let drawX;
    let renderedParts: SVGTemplateResult[];
    if (this.inverted) {
      drawX = hasClue;
      renderedParts = [];
    } else {
      renderedParts = super.renderShape(row, col, hasClue);
      drawX = !hasClue;
    }
    if (drawX) {
      renderedParts.push(
        svg`<path class="x"
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
