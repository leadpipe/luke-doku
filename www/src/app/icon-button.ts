import './mat-icon';
import {css, html, LitElement} from 'lit';
import {customElement, property} from 'lit/decorators.js';

@customElement('icon-button')
export class IconButton extends LitElement {
  static override styles = css`
    :host {
      display: inline flex;
      flex-direction: column;
      font-size: x-small;
      align-items: center;
    }

    :host([disabled]) {
      opacity: 50%;
    }

    button {
      text-decoration: none;
      cursor: pointer;
      user-select: none;
      -webkit-user-select: none;
      color: inherit;
      background: none;
      border: none;
      padding: 0;
    }
  `;

  override render() {
    return html`
      <button ?disabled=${this.disabled} title=${this.title}>
        <mat-icon name=${this.iconName} size=${this.iconSize}></mat-icon>
      </button>
      ${this.label}
    `;
  }

  @property() iconName: string = '';
  @property() iconSize: string = '';
  @property({type: Boolean}) disabled = false;
  @property() override title: string = '';
  @property() label: string = '';
}

declare global {
  interface HTMLElementTagNameMap {
    'icon-button': IconButton;
  }
}
