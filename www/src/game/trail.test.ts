import { expect } from '@esm-bundle/chai';
import {Loc} from './loc';
import {Trail} from './trail';

describe(`Trail`, () => {
  it(`correctly handles clearing a cell in an empty trail`, () => {
    const trail = new Trail(0);
    expect(trail.set(Loc.of(0), null)).to.equal(true);
    expect(trail.trailhead).to.equal(null);
  });

  it(`correctly handles clearing the trailhead`, () => {
    const trail = new Trail(0);
    expect(trail.set(Loc.of(0), 1)).to.equal(true);
    expect(trail.trailhead).to.equal(Loc.of(0));
    expect(trail.set(Loc.of(0), null)).to.equal(true);
    expect(trail.trailhead).to.equal(null);
  });

  it(`correctly handles attempting to change the trailhead`, () => {
    const trail = new Trail(0);
    expect(trail.set(Loc.of(0), 1)).to.equal(true);
    expect(trail.trailhead).to.equal(Loc.of(0));
    expect(trail.set(Loc.of(0), 2)).to.equal(true);

    expect(trail.set(Loc.of(1), 1)).to.equal(true); // Now the trailhead can't be altered
    expect(trail.set(Loc.of(0), 1)).to.equal(false);
    expect(trail.set(Loc.of(0), null)).to.equal(false);
  });
});
