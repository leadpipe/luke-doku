import {LitElement, css, html, svg} from 'lit';
import {customElement, state} from 'lit/decorators.js';
import {COLOR_RANGES, ColorRange} from './colors';

enum Axis {
  LIGHTNESS = 0,
  CHROMA,
  HUE,
}

interface FaceParams {
  x: number;
  y: number;
  xAxis: Axis;
  xAsc: boolean;
  yAxis: Axis;
  yAsc: boolean;
  zMin: boolean;
}

function baseSliderValue(
  params: FaceParams,
  i: number,
  j: number,
  axis: Axis,
): number {
  if (params.xAxis === axis) {
    const fraction = i / 10;
    return params.xAsc ? fraction : 1 - fraction;
  }
  if (params.yAxis === axis) {
    const fraction = j / 10;
    return params.yAsc ? fraction : 1 - fraction;
  }
  return params.zMin ? 0 : 1;
}

function sliderValue(
  params: FaceParams,
  i: number,
  j: number,
  axis: Axis,
  minPercent: number,
  maxPercent: number,
): number {
  const base = baseSliderValue(params, i, j, axis);
  const range = maxPercent - minPercent;
  return (minPercent + range * base) / 100;
}

@customElement('color-cube')
export class ColorCube extends LitElement {
  static override styles = css`
    :host {
      display: flex;
      flex-direction: row;
      gap: 20px;
      margin: 10px;
      align-items: start;
      justify-content: space-around;
      width: 100vw;
    }
    .controls {
      display: flex;
      flex-direction: column;
      max-width: 20vw;
    }
  `;

  override render() {
    return html`
      <div class="controls">
        <select @input=${this.handleRangeSelected}>
          ${COLOR_RANGES.map(
            (r, i) =>
              html`<option value=${i} ?selected=${i === this.colorRangeIndex}>
                ${r.name}
              </option>`,
          )}
        </select>
        <label>
          Lightness <br />
          <input
            type="range"
            value=${this.minLightness}
            @change=${this.changeMinLightness}
          />
          <input
            type="range"
            value=${this.maxLightness}
            @change=${this.changeMaxLightness}
          />
        </label>
        <label>
          Chroma <br />
          <input
            type="range"
            value=${this.minChroma}
            @change=${this.changeMinChroma}
          />
          <input
            type="range"
            value=${this.maxChroma}
            @change=${this.changeMaxChroma}
          />
        </label>
        <label>
          Hue <br />
          <input
            type="range"
            value=${this.minHue}
            @change=${this.changeMinHue}
          />
          <input
            type="range"
            value=${this.maxHue}
            @change=${this.changeMaxHue}
          />
        </label>
        <div>
          ${COLOR_RANGES[this.colorRangeIndex]
            .interpolate(
              this.minLightness / 100,
              this.minChroma / 100,
              this.minHue / 100,
            )
            .toColor()}
        </div>
        <div>
          ${COLOR_RANGES[this.colorRangeIndex]
            .interpolate(
              this.maxLightness / 100,
              this.maxChroma / 100,
              this.maxHue / 100,
            )
            .toColor()}
        </div>
      </div>
      <svg viewbox="0 0 40 30" width="64vw" height="48vw">
        ${this.renderFace({
          x: 0,
          y: 10,
          xAxis: Axis.LIGHTNESS,
          xAsc: true,
          yAxis: Axis.CHROMA,
          yAsc: true,
          zMin: true,
        })}
        ${this.renderFace({
          x: 10,
          y: 10,
          xAxis: Axis.HUE,
          xAsc: true,
          yAxis: Axis.CHROMA,
          yAsc: true,
          zMin: false,
        })}
        ${this.renderFace({
          x: 20,
          y: 10,
          xAxis: Axis.LIGHTNESS,
          xAsc: false,
          yAxis: Axis.CHROMA,
          yAsc: true,
          zMin: false,
        })}
        ${this.renderFace({
          x: 30,
          y: 10,
          xAxis: Axis.HUE,
          xAsc: false,
          yAxis: Axis.CHROMA,
          yAsc: true,
          zMin: true,
        })}
        ${this.renderFace({
          x: 20,
          y: 0,
          xAxis: Axis.LIGHTNESS,
          xAsc: false,
          yAxis: Axis.HUE,
          yAsc: true,
          zMin: true,
        })}
        ${this.renderFace({
          x: 20,
          y: 20,
          xAxis: Axis.LIGHTNESS,
          xAsc: false,
          yAxis: Axis.HUE,
          yAsc: false,
          zMin: false,
        })}
      </svg>
    `;
  }

  private renderFace(params: FaceParams) {
    const range = COLOR_RANGES[this.colorRangeIndex];
    const squares = [];
    for (let i = 0; i < 10; ++i) {
      for (let j = 0; j < 10; ++j) {
        squares.push(
          svg`<rect x=${params.x + i}
                    y=${params.y + j}
                    width="1"
                    height="1" 
                    fill=${this.colorForSquare(range, params, i, j)} />`,
        );
      }
    }
    return squares;
  }

  private colorForSquare(
    range: ColorRange,
    params: FaceParams,
    i: number,
    j: number,
  ): string {
    const l = sliderValue(
      params,
      i,
      j,
      Axis.LIGHTNESS,
      this.minLightness,
      this.maxLightness,
    );
    const c = sliderValue(
      params,
      i,
      j,
      Axis.CHROMA,
      this.minChroma,
      this.maxChroma,
    );
    const h = sliderValue(params, i, j, Axis.HUE, this.minHue, this.maxHue);
    return range.interpolate(l, c, h).toColor();
  }

  @state() private colorRangeIndex = 0;
  @state() private minLightness = 0;
  @state() private maxLightness = 100;
  @state() private minChroma = 0;
  @state() private maxChroma = 100;
  @state() private minHue = 0;
  @state() private maxHue = 100;

  private handleRangeSelected(event: InputEvent) {
    this.colorRangeIndex = Number((event.target as HTMLSelectElement).value);
  }

  private changeMinLightness(event: InputEvent) {
    this.minLightness = Number((event.target as HTMLInputElement).value);
    this.maxLightness = Math.max(this.maxLightness, this.minLightness);
  }
  private changeMaxLightness(event: InputEvent) {
    this.maxLightness = Number((event.target as HTMLInputElement).value);
    this.minLightness = Math.min(this.minLightness, this.maxLightness);
  }
  private changeMinChroma(event: InputEvent) {
    this.minChroma = Number((event.target as HTMLInputElement).value);
    this.maxChroma = Math.max(this.maxChroma, this.minChroma);
  }
  private changeMaxChroma(event: InputEvent) {
    this.maxChroma = Number((event.target as HTMLInputElement).value);
    this.minChroma = Math.min(this.minChroma, this.maxChroma);
  }
  private changeMinHue(event: InputEvent) {
    this.minHue = Number((event.target as HTMLInputElement).value);
    this.maxHue = Math.max(this.maxHue, this.minHue);
  }
  private changeMaxHue(event: InputEvent) {
    this.maxHue = Number((event.target as HTMLInputElement).value);
    this.minHue = Math.min(this.minHue, this.maxHue);
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'color-cube': ColorCube;
  }
}
