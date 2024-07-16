import {css, html, LitElement} from 'lit';
import {customElement, property} from 'lit/decorators.js';

@customElement('mat-icon')
export class MatIcon extends LitElement {
  static override styles = css`
    :host {
      display: inline-block;
    }

    .material-icons {
      font-family: 'Material Icons';
      font-weight: normal;
      font-style: normal;
      font-size: 24px; /* Preferred icon size */
      display: inline-block;
      line-height: 1;
      text-transform: none;
      letter-spacing: normal;
      word-wrap: normal;
      white-space: nowrap;
      direction: ltr;
      -webkit-font-smoothing: antialiased;
      text-rendering: optimizeLegibility;
      -moz-osx-font-smoothing: grayscale;
      vertical-align: bottom;
    }

    .material-icons.large {
      font-size: 48px;
    }
  `;

  override render() {
    return html`<span class="material-icons ${this.size}">${this.name}</span>`;
  }

  @property() name: string = '';
  @property() size: string = '';
}

declare global {
  interface HTMLElementTagNameMap {
    'mat-icon': MatIcon;
  }
}
