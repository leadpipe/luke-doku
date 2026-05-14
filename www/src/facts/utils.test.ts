import {expect} from '@esm-bundle/chai';
import {Loc as GameLoc} from '../game/loc';
import type {Fact} from './Fact';
import {nub, unitContains} from './utils';

describe('Fact utils', () => {
  describe('nub', () => {
    it('returns the same fact if it is not an Implication', () => {
      const fact: Fact = {
        type: 'SingleLoc',
        num: 5,
        unit: {type: 'Row', id: 0},
        loc: 2,
      };
      expect(nub(fact)).to.equal(fact);
    });

    it('unwraps a single Implication', () => {
      const consequent: Fact = {type: 'SingleNum', num: 5, loc: 2};
      const fact: Fact = {
        type: 'Implication',
        antecedents: [],
        consequent,
      };
      expect(nub(fact)).to.equal(consequent);
    });

    it('unwraps nested Implications', () => {
      const ultimateConsequent: Fact = {type: 'SingleNum', num: 5, loc: 2};
      const nested: Fact = {
        type: 'Implication',
        antecedents: [],
        consequent: ultimateConsequent,
      };
      const fact: Fact = {
        type: 'Implication',
        antecedents: [],
        consequent: nested,
      };
      expect(nub(fact)).to.equal(ultimateConsequent);
    });
  });

  describe('unitContains', () => {
    it('checks Row containment correctly', () => {
      const loc = GameLoc.of(1, 4); // Row 1 (2nd row), Col 4
      expect(unitContains({type: 'Row', id: 1}, loc)).to.be.true;
      expect(unitContains({type: 'Row', id: 2}, loc)).to.be.false;
    });

    it('checks Col containment correctly', () => {
      const loc = GameLoc.of(1, 4); // Row 1, Col 4
      expect(unitContains({type: 'Col', id: 4}, loc)).to.be.true;
      expect(unitContains({type: 'Col', id: 5}, loc)).to.be.false;
    });

    it('checks Blk containment correctly', () => {
      // Block layout:
      // 0 1 2
      // 3 4 5
      // 6 7 8
      const loc0 = GameLoc.of(0, 0); // Block 0
      const loc1 = GameLoc.of(1, 4); // Block 1
      const loc4 = GameLoc.of(4, 4); // Block 4
      const loc8 = GameLoc.of(8, 8); // Block 8

      expect(unitContains({type: 'Blk', id: 0}, loc0)).to.be.true;
      expect(unitContains({type: 'Blk', id: 1}, loc0)).to.be.false;

      expect(unitContains({type: 'Blk', id: 1}, loc1)).to.be.true;
      expect(unitContains({type: 'Blk', id: 4}, loc1)).to.be.false;

      expect(unitContains({type: 'Blk', id: 4}, loc4)).to.be.true;
      expect(unitContains({type: 'Blk', id: 5}, loc4)).to.be.false;

      expect(unitContains({type: 'Blk', id: 8}, loc8)).to.be.true;
      expect(unitContains({type: 'Blk', id: 7}, loc8)).to.be.false;
    });
  });
});
