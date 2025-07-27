import {Loc} from './loc';
import {Marks} from './marks';

// Written (almost entirely) by Claude Sonnet 3.5, wow
describe('Marks', () => {
  describe('negation logic', () => {
    it('correctly handles initial state with no negations', () => {
      const marks = new Marks();
      const testLoc = Loc.of(0);
      const testNum = 5;
      expect(marks.isNegated(testLoc, testNum)).toBe(false);
    });

    it('tracks negations when setting a single number in a peer cell', () => {
      const marks = new Marks();
      const center = Loc.of(40); // Center cell
      const rightPeer = Loc.of(41); // Right neighbor in same row

      // Set multiple possibilities in center cell
      marks.setNums(center, new Set([1, 2, 3]));

      // Set a value in peer that should negate one of the possibilities
      marks.setNum(rightPeer, 2);

      expect(marks.isNegated(center, 2)).toBe(true);
      expect(marks.isNegated(center, 1)).toBe(false);
      expect(marks.isNegated(center, 3)).toBe(false);
    });

    it('removes negations when clearing a peer cell', () => {
      const marks = new Marks();
      const center = Loc.of(40);
      const rightPeer = Loc.of(41);

      marks.setNums(center, new Set([1, 2, 3]));
      marks.setNum(rightPeer, 2);
      expect(marks.isNegated(center, 2)).toBe(true);

      marks.clearCell(rightPeer);
      expect(marks.isNegated(center, 2)).toBe(false);
    });

    it('updates negations when changing a cell value', () => {
      const marks = new Marks();
      const center = Loc.of(40);
      const rightPeer = Loc.of(41);

      marks.setNums(center, new Set([1, 2, 3]));
      marks.setNum(rightPeer, 2);
      expect(marks.isNegated(center, 2)).toBe(true);

      marks.setNum(rightPeer, 4); // Change to a number not in center's possibilities
      expect(marks.isNegated(center, 2)).toBe(false);
    });

    it('handles multiple peers negating the same number', () => {
      const marks = new Marks();
      const center = Loc.of(40);
      const rightPeer = Loc.of(41);
      const leftPeer = Loc.of(39);

      marks.setNums(center, new Set([1, 2, 3]));
      marks.setNum(rightPeer, 2);
      marks.setNum(leftPeer, 2);

      expect(marks.isNegated(center, 2)).toBe(true);

      // Clearing one peer shouldn't remove the negation since another peer still has the value
      marks.clearCell(rightPeer);
      expect(marks.isNegated(center, 2)).toBe(true);

      // Clearing all peers with the value should remove the negation
      marks.clearCell(leftPeer);
      expect(marks.isNegated(center, 2)).toBe(false);
    });

    it('maintains negation state when modifying non-peer cells', () => {
      const marks = new Marks();
      const center = Loc.of(40);
      const nonPeer = Loc.of(80); // Cell in different row/column/block

      marks.setNums(center, new Set([1, 2, 3]));
      expect(marks.isNegated(center, 2)).toBe(false);

      // Setting value in non-peer shouldn't affect negation
      marks.setNum(nonPeer, 2);
      expect(marks.isNegated(center, 2)).toBe(false);
    });

    it('updates negations when modifying possibilities in target cell', () => {
      const marks = new Marks();
      const center = Loc.of(40);
      const rightPeer = Loc.of(41);

      marks.setNums(center, new Set([1, 2, 3]));
      marks.setNum(rightPeer, 2);
      expect(marks.isNegated(center, 2)).toBe(true);

      // Changing possibilities should update negations
      marks.setNums(center, new Set([1, 3]));
      expect(marks.isNegated(center, 2)).toBe(false);

      // Changing possibilities back should restore negations
      marks.setNums(center, new Set([1, 2, 3]));
      expect(marks.isNegated(center, 2)).toBe(true);

      // Negations only count for multi-valued cells
      marks.setNum(center, 2);
      expect(marks.isNegated(center, 2)).toBe(false);
    });
  });
});
