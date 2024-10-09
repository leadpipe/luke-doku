import {Loc} from './loc';
import {Trail} from './trail';

describe(`Trail`, () => {
  it(`correctly handles clearing a cell in an empty trail`, () => {
    const trail = new Trail(0);
    expect(trail.set(Loc.of(0), null)).toBe(true);
    expect(trail.trailhead).toBe(null);
  });

  it(`correctly handles clearing the trailhead`, () => {
    const trail = new Trail(0);
    expect(trail.set(Loc.of(0), 1)).toBe(true);
    expect(trail.trailhead).toBe(Loc.of(0));
    expect(trail.set(Loc.of(0), null)).toBe(true);
    expect(trail.trailhead).toBe(null);
  });

  it(`correctly handles attempting to change the trailhead`, () => {
    const trail = new Trail(0);
    expect(trail.set(Loc.of(0), 1)).toBe(true);
    expect(trail.trailhead).toBe(Loc.of(0));
    expect(trail.set(Loc.of(0), 2)).toBe(true);

    expect(trail.set(Loc.of(1), 1)).toBe(true); // Now the trailhead can't be altered
    expect(trail.set(Loc.of(0), 1)).toBe(false);
    expect(trail.set(Loc.of(0), null)).toBe(false);
  });
});
