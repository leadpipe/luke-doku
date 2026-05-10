import {LitElement, ReactiveController} from 'lit';
import {Loc} from '../game/loc';
import {dispatchTypeSafeEvent} from './events';
import {GridContainer} from './types';

/**
 * Manages click inputs on the ReplayView to select cells for review.
 */
export class ReplayInput implements ReactiveController {
  private selectedLoc: Loc | null = null;

  constructor(private readonly host: LitElement & GridContainer) {
    host.addController(this);
  }

  hostConnected(): void {
    const {host} = this;
    host.addEventListener('pointerup', this.upHandler);
  }

  hostDisconnected(): void {
    const {host} = this;
    host.removeEventListener('pointerup', this.upHandler);
  }

  private readonly upHandler = (event: PointerEvent) => {
    const loc = this.host.getLocFromEvent(event);
    if (!loc) return;

    // Toggle selection if clicking the same cell
    if (this.selectedLoc?.index === loc.index) {
      this.selectedLoc = null;
    } else {
      this.selectedLoc = loc;
    }

    dispatchTypeSafeEvent(this.host, 'cell-selected', this.selectedLoc);
    this.host.requestUpdate();
  };
}
