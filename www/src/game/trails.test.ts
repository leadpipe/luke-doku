import {Trail} from './trail';
import {Trails} from './trails';

const {objectContaining} = expect;

describe(`Trails`, () => {
  it(`starts empty and inactive`, () => {
    const trails = new Trails();
    expect(trails).toEqual(
      objectContaining({
        order: [],
        numVisible: 0,
        numArchived: 0,
        active: false,
        activeTrail: null,
      }),
    );
  });

  describe(`create`, () => {
    it(`activates and makes visible the new trail`, () => {
      const trails = new Trails();
      const trail = trails.create();
      expect(trails).toEqual(
        objectContaining({
          order: [trail],
          numVisible: 1,
          numArchived: 0,
          active: true,
          activeTrail: trail,
        }),
      );
      expect(trails.isVisible(trail)).toBe(true);
      expect(trails.isArchived(trail)).toBe(false);
    });
  });

  describe(`activate`, () => {
    it(`disallows activating an external trail`, () => {
      const trails = new Trails();
      expect(trails.activate(new Trail(0))).toBe(false);
    });

    it(`revives an archived trail`, () => {
      const trails = new Trails();
      const trail = trails.create();
      trails.archive(trail);
      expect(trails.activate(trail)).toBe(true);
      expect(trails).toEqual(
        objectContaining({
          order: [trail],
          numVisible: 1,
          numArchived: 0,
          active: true,
          activeTrail: trail,
        }),
      );
      expect(trails.isVisible(trail)).toBe(true);
      expect(trails.isArchived(trail)).toBe(false);
    });

    it(`makes an invisible trail visible`, () => {
      const trails = new Trails();
      const trail = trails.create();
      trails.toggleVisibility(trail);
      expect(trails.activate(trail)).toBe(true);
      expect(trails).toEqual(
        objectContaining({
          order: [trail],
          numVisible: 1,
          numArchived: 0,
          active: true,
          activeTrail: trail,
        }),
      );
      expect(trails.isVisible(trail)).toBe(true);
      expect(trails.isArchived(trail)).toBe(false);
    });
  });

  describe(`toggleVisibility`, () => {
    it(`makes the active trail inactive when toggling its visibility off`, () => {
      const trails = new Trails();
      const trail = trails.create();
      expect(trails.toggleVisibility(trail)).toBe(true);
      expect(trails).toEqual(
        objectContaining({
          order: [trail],
          numVisible: 0,
          numArchived: 0,
          active: false,
          activeTrail: null,
        }),
      );
      expect(trails.isVisible(trail)).toBe(false);
      expect(trails.isArchived(trail)).toBe(false);
    });

    it(`disallows toggling visibility of an external trail`, () => {
      const trails = new Trails();
      expect(trails.toggleVisibility(new Trail(0))).toBe(false);
    });
  });

  describe(`archive`, () => {
    it(`disallows archiving an external trail`, () => {
      const trails = new Trails();
      expect(trails.archive(new Trail(0))).toBe(false);
    });

    it(`makes the active trail inactive`, () => {
      const trails = new Trails();
      const trail = trails.create();
      expect(trails.archive(trail)).toBe(true);
      expect(trails).toEqual(
        objectContaining({
          order: [trail],
          numVisible: 0,
          numArchived: 1,
          active: false,
          activeTrail: null,
        }),
      );
      expect(trails.isVisible(trail)).toBe(false);
      expect(trails.isArchived(trail)).toBe(true);
    });

    it(`activates the second trail if it is visible`, () => {
      const trails = new Trails();
      const trail2 = trails.create();
      const trail1 = trails.create();
      expect(trails.archive(trail1)).toBe(true);
      expect(trails).toEqual(
        objectContaining({
          order: [trail2, trail1],
          numVisible: 1,
          numArchived: 1,
          active: true,
          activeTrail: trail2,
        }),
      );
      expect(trails.isVisible(trail1)).toBe(false);
      expect(trails.isArchived(trail1)).toBe(true);
      expect(trails.isVisible(trail2)).toBe(true);
      expect(trails.isArchived(trail2)).toBe(false);
    });

    it(`leaves the second trail invisible`, () => {
      const trails = new Trails();
      const trail2 = trails.create();
      trails.toggleVisibility(trail2);
      const trail1 = trails.create();
      expect(trails.archive(trail1)).toBe(true);
      expect(trails).toEqual(
        objectContaining({
          order: [trail2, trail1],
          numVisible: 0,
          numArchived: 1,
          active: false,
          activeTrail: null,
        }),
      );
      expect(trails.isVisible(trail1)).toBe(false);
      expect(trails.isArchived(trail1)).toBe(true);
      expect(trails.isVisible(trail2)).toBe(false);
      expect(trails.isArchived(trail2)).toBe(false);
    });

    it(`leaves the first trail active`, () => {
      const trails = new Trails();
      const trail2 = trails.create();
      const trail1 = trails.create();
      expect(trails.archive(trail2)).toBe(true);
      expect(trails).toEqual(
        objectContaining({
          order: [trail1, trail2],
          numVisible: 1,
          numArchived: 1,
          active: true,
          activeTrail: trail1,
        }),
      );
      expect(trails.isVisible(trail1)).toBe(true);
      expect(trails.isArchived(trail1)).toBe(false);
      expect(trails.isVisible(trail2)).toBe(false);
      expect(trails.isArchived(trail2)).toBe(true);
    });

    it(`disallows archiving an already archived trail`, () => {
      const trails = new Trails();
      const trail = trails.create();
      expect(trails.archive(trail)).toBe(true);
      expect(trails.archive(trail)).toBe(false);
    });

    it(`leaves the second archived trail in front of the first`, () => {
      const trails = new Trails();
      const trail2 = trails.create();
      const trail1 = trails.create();
      expect(trails.archive(trail2)).toBe(true);
      expect(trails.archive(trail1)).toBe(true);
      expect(trails).toEqual(
        objectContaining({
          order: [trail1, trail2],
          numVisible: 0,
          numArchived: 2,
          active: false,
          activeTrail: null,
        }),
      );
      expect(trails.isVisible(trail1)).toBe(false);
      expect(trails.isArchived(trail1)).toBe(true);
      expect(trails.isVisible(trail2)).toBe(false);
      expect(trails.isArchived(trail2)).toBe(true);
    });
  });

  describe(`toggleActive`, () => {
    it(`fails when empty`, () => {
      const trails = new Trails();
      expect(trails.toggleActive()).toBe(false);
      expect(trails).toEqual(
        objectContaining({
          order: [],
          numVisible: 0,
          numArchived: 0,
          active: false,
          activeTrail: null,
        }),
      );
    });

    it(`makes the active trail inactive when toggling active off`, () => {
      const trails = new Trails();
      const trail = trails.create();
      expect(trails.toggleActive()).toBe(true);
      expect(trails).toEqual(
        objectContaining({
          order: [trail],
          numVisible: 1,
          numArchived: 0,
          active: false,
          activeTrail: null,
        }),
      );
      expect(trails.isVisible(trail)).toBe(true);
      expect(trails.isArchived(trail)).toBe(false);
    });

    it(`makes the inactive and invisible first trail active and visible when toggling active on`, () => {
      const trails = new Trails();
      const trail = trails.create();
      expect(trails.toggleVisibility(trail)).toBe(true);
      expect(trails.toggleActive()).toBe(true);
      expect(trails).toEqual(
        objectContaining({
          order: [trail],
          numVisible: 1,
          numArchived: 0,
          active: true,
          activeTrail: trail,
        }),
      );
      expect(trails.isVisible(trail)).toBe(true);
      expect(trails.isArchived(trail)).toBe(false);
    });

    it(`revives an archived trail`, () => {
      const trails = new Trails();
      const trail = trails.create();
      trails.archive(trail);
      expect(trails.toggleActive()).toBe(true);
      expect(trails).toEqual(
        objectContaining({
          order: [trail],
          numVisible: 1,
          numArchived: 0,
          active: true,
          activeTrail: trail,
        }),
      );
      expect(trails.isVisible(trail)).toBe(true);
      expect(trails.isArchived(trail)).toBe(false);
    });
  });

  describe(`replaceActiveTrail`, () => {
    it(`is disallowed when not active`, () => {
      const trails = new Trails();
      const trail = new Trail(0);
      expect(trails.replaceActiveTrail(trail)).toBe(false);
    });

    it(`is disallowed when the new trail's ID doesn't match the active trail's ID`, () => {
      const trails = new Trails();
      const trail1 = trails.create();
      const trail2 = new Trail(trail1.id + 1);
      expect(trails.replaceActiveTrail(trail2)).toBe(false);
      expect(trails.activeTrail).toBe(trail1);
    });

    it(`succeeds`, () => {
      const trails = new Trails();
      const trail1 = trails.create();
      const trail2 = new Trail(trail1.id);
      expect(trails.replaceActiveTrail(trail2)).toBe(true);
      expect(trails.activeTrail).toBe(trail2);
    });
  });
});
