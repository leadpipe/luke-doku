import {ReadonlyTrail, Trail} from './trail';

/**
 * The largest number of trails that can be simultaneously visible: each trail
 * occupies a different corner of the grid's cells.
 */
const MAX_VISIBLE_TRAILS = 4;

/**
 * Maintains the trails a Sudoku solver has created during a game.
 */
export class Trails {
  /**
   * The current order for the trails: activating a trail moves it to the front
   * of this list; all visible trails (up to 4 at a time) precede the rest; and
   * all archived trails follow the rest.
   */
  private readonly _order: Trail[];

  /**
   * How many trails are currently being displayed on the grid, at the start of
   * `trailsOrder`.
   */
  private _numVisible: number;

  /**
   * How many trails have been archived, or marked no longer relevant, at the
   * end of `trailsOrder`.
   */
  private _numArchived: number;

  /**
   * Whether the first trail in `trailsOrder` will be updated by the user's
   * input.  When false, the default, the full solution grid is updated by the
   * user's input.
   */
  private _active: boolean;

  constructor(that?: Trails) {
    if (that) {
      this._order = [...that._order];
      this._numVisible = that._numVisible;
      this._numArchived = that._numArchived;
      this._active = that._active;
    } else {
      this._order = [];
      this._numVisible = 0;
      this._numArchived = 0;
      this._active = false;
    }
  }

  /** All the trails, in their current order. */
  get order(): readonly ReadonlyTrail[] {
    return this._order;
  }

  /** The number of trails currently being displayed in the grid. */
  get numVisible(): number {
    return this._numVisible;
  }

  /** The number of trails being shown as archived in the game. */
  get numArchived(): number {
    return this._numArchived;
  }

  /** Whether the trails are active: the user's input modifies the first trail. */
  get active(): boolean {
    return this._active;
  }

  /** The active trail, or null if there isn't one. */
  get activeTrail(): Trail | null {
    return this._active ? this._order[0] : null;
  }

  /**
   * Creates a new Trail, optionally duplicating an existing one, and activates
   * it.
   */
  create(trail?: ReadonlyTrail): Trail {
    const {_order} = this;
    const newTrail = new Trail(_order.length, trail);
    _order.unshift(newTrail);
    this.incrementNumVisible();
    this._active = true;
    return newTrail;
  }

  /**
   * Returns the trail with the given ID, if there is one with that ID.
   */
  get(id: number): Trail | null {
    return this._order.find(t => t.id === id) ?? null;
  }

  /**
   * Tells whether the given trail is visible.
   */
  isVisible(trail: ReadonlyTrail): boolean {
    const index = this.indexOf(trail);
    return index >= 0 && index < this._numVisible;
  }

  /**
   * Tells whether the given trail is archived.
   */
  isArchived(trail: ReadonlyTrail): boolean {
    const index = this.indexOf(trail);
    return index >= this._order.length - this._numArchived;
  }

  /**
   * Moves the given trail to the beginning of the order, unarchiving it if
   * necessary, makes it visible, and ensures that trails are active.  Returns
   * false if the given trail does not belong to this object.
   */
  activate(trail: ReadonlyTrail): boolean {
    const index = this.indexOf(trail);
    if (index < 0) {
      // It's not in the array, give up.
      return false;
    }
    if (index >= this._numVisible) {
      // It's not visible.  Increase the number visible (if possible).
      this.incrementNumVisible();
      if (index >= this._order.length - this._numArchived) {
        // It's also archived.  Reduce the number archived.
        --this._numArchived;
      }
    }
    this.moveTrail(trail, index, 0);
    this._active = true;
    return true;
  }

  /**
   * Moves the given trail the minimum distance within the order to make it
   * visible if it wasn't or to make it invisible if it was.  If this results in
   * there being no visible trails, also sets trails inactive.  Returns false if
   * the given trail does not belong to this object.
   */
  toggleVisibility(trail: ReadonlyTrail): boolean {
    const index = this.indexOf(trail);
    if (index < 0) {
      // It's not in the array, give up.
      return false;
    }
    let targetIndex;
    if (index < this._numVisible) {
      // It's visible.  We decrement the number visible and flip active off if
      // none remain visible.
      targetIndex = --this._numVisible; // we'll move it to the first invisible slot
      if (targetIndex === 0) {
        this._active = false;
      }
    } else {
      // It's not visible.  Increase the number visible (if possible).
      this.incrementNumVisible();
      targetIndex = this._numVisible - 1; // we'll move it to the last visible slot
      if (index >= this._order.length - this._numArchived) {
        // It's also archived.  Reduce the number archived.
        --this._numArchived;
      }
    }
    this.moveTrail(trail, index, targetIndex);
    return true;
  }

  /**
   * Moves the given trail the minimum distance within the order to make it
   * archived.  Returns false if the given trail does not belong to this object,
   * or if the trail is already archived.
   */
  archive(trail: ReadonlyTrail): boolean {
    const index = this.indexOf(trail);
    if (index < 0) {
      // It's not in the array, give up.
      return false;
    }
    const targetIndex = this._order.length - this._numArchived - 1;
    if (index > targetIndex) {
      // It's already archived.
      return false;
    }
    if (index < this._numVisible) {
      // It's visible.  We decrement the number visible and flip active off if
      // none remain visible.
      if (!--this._numVisible) {
        this._active = false;
      }
    }
    ++this._numArchived;
    this.moveTrail(trail, index, targetIndex);
    return true;
  }

  /**
   * Flips the active flag and returns true, unless it's currently off and there
   * are no trails, in which case it returns false without flipping the flag.
   * If it's currently off and there are no visible trails, makes the first
   * trail visible.
   */
  toggleActive(): boolean {
    if (this._active) {
      this._active = false;
    } else if (this._order.length === 0) {
      return false;
    } else {
      this._active = true;
      if (this._numVisible === 0) {
        this.incrementNumVisible();
      }
    }
    return true;
  }

  /**
   * Replaces the active trail with a different object, and tells whether it was
   * possible.  It is possible when there is an active trail and the replacement
   * trail has the same ID as the active trail.
   */
  replaceActiveTrail(trail: Trail): boolean {
    if (trail.id !== this.activeTrail?.id) {
      return false;
    }
    this._order[0] = trail;
    return true;
  }

  /**
   * Finds the current index of the given trail, or -1 if it doesn't belong to
   * this object.
   */
  private indexOf(trail: ReadonlyTrail): number {
    return this._order.findIndex(t => t === trail);
  }

  /** Bumps up the number of visible trails by one, stopping at the upper bound. */
  private incrementNumVisible() {
    this._numVisible = Math.min(MAX_VISIBLE_TRAILS, this._numVisible + 1);
  }

  /** Moves the given trail within the array */
  private moveTrail(trail: ReadonlyTrail, fromIndex: number, toIndex: number) {
    if (fromIndex !== toIndex) {
      this._order.splice(fromIndex, 1); // remove it from its current spot
      this._order.splice(toIndex, 0, trail as Trail); // insert it at the target
    }
  }
}

export type ReadonlyTrails = Pick<
  Trails,
  'order' | 'active' | 'numVisible' | 'numArchived'
>;
