import {Grid} from './grid';
import {Loc} from './loc';

/**
 * Represents part of an attempted solution to a Sudoku puzzle, a set of
 * assignments that follow from an initial assignment known as the trailhead.
 */
export class Trail extends Grid {
  private trailheadState: Loc | null = null;

  /**
   * Duplicates a trail, or creates an empty one.
   */
  constructor(readonly id: number, trail?: ReadonlyTrail) {
    super(trail);
    if (trail) this.trailheadState = trail.trailhead;
  }

  /**
   * Returns the first location assigned, or null if no location has been
   * assigned yet.
   */
  get trailhead(): Loc | null {
    return this.trailheadState;
  }

  /** Tells whether this trail is empty. */
  get isEmpty(): boolean {
    return this.trailheadState == null;
  }

  /**
   * Overrides Grid's `set` method to track the first location set, and to
   * return a boolean telling whether the location could be set.  In a Trail,
   * any location can be assigned or cleared, except the trailhead may not be
   * cleared if there are any other locations that are also assigned.
   */
  override set(loc: Loc, num: number | null): boolean {
    const count = this.getAssignedCount();
    if (num == null && loc === this.trailheadState && count > 1) {
      return false; // You can't clear the trailhead unless it's the only location with an assignment.
    }
    super.set(loc, num);
    if (count === 0) {
      this.trailheadState = loc;
    }
    return true;
  }
}

/** A Trail that you can't modify. */
export type ReadonlyTrail = Omit<Trail, 'set'>;
